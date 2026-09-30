import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createReadStream } from "fs";
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from "fs/promises";
import { basename, resolve, sep } from "path";
import { Readable, Transform } from "stream";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

// ---------------------------------------------------------------------------
// Storage backend selection
//
// "local"  -- the original behaviour: files live on STORAGE_ROOT, a plain
//             mounted disk. Used in dev, and in any deployment (like Replit)
//             where the disk is durable.
// "r2"     -- used when this server runs inside a Cloudflare Container. The
//             container has no direct R2 binding, so every object read/write
//             is a plain HTTP request to a virtual hostname
//             (STORAGE_R2_HOST, default "objects.internal"). The Worker in
//             front of the container intercepts that hostname via an
//             `outboundByHost` handler and does the real env.BUCKET call --
//             see artifacts/api-server/../../src/worker.ts.
//
// Every public method on ObjectStorageService keeps its existing signature
// and return shape either way, so route handlers that call
// `readFile(file.path)` / `stat(file.path)` on the LocalObjectFile a method
// returns keep working unmodified: in "r2" mode, getObjectEntityFile()
// downloads the object to a local temp-cache file first and returns *that*
// path, rather than changing every call site to a streaming API.
// ---------------------------------------------------------------------------
const STORAGE_BACKEND = process.env.STORAGE_BACKEND === "r2" ? "r2" : "local";
const r2Host = process.env.STORAGE_R2_HOST || "objects.internal";
const r2CacheDir = resolve(process.env.STORAGE_R2_CACHE_DIR || "/tmp/object-cache");

const storageRoot = resolve(process.env.STORAGE_ROOT || "./storage");
const privateDirectory = process.env.STORAGE_PRIVATE_DIR || "private";
const publicDirectories = (process.env.STORAGE_PUBLIC_DIRS || "public")
  .split(",")
  .map((directory) => directory.trim())
  .filter(Boolean);
const metadataSuffix = ".object-metadata.json";

export interface LocalObjectFile {
  /**
   * "local" mode: absolute path on the mounted storage volume.
   * "r2" mode: the R2 object key (e.g. "private/uploads/<uuid>"). Methods
   * that need real bytes on disk (getObjectEntityFile) resolve this to a
   * temp-cache path internally before returning to the caller.
   */
  path: string;
  /** Relative path within its configured storage directory (the R2 key, minus the local disk root, in either mode). */
  name: string;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
    Object.setPrototypeOf(this, UploadValidationError.prototype);
  }
}

interface R2ObjectMeta {
  contentType?: string;
  customMetadata: Record<string, string>;
  etag?: string;
  size?: number;
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): Array<string> {
    return publicDirectories.map((directory) => this.resolveDirectory(directory));
  }

  getPrivateObjectDir(): string {
    return this.resolveDirectory(privateDirectory);
  }

  async searchPublicObject(filePath: string): Promise<LocalObjectFile | null> {
    for (const directory of this.getPublicObjectSearchPaths()) {
      const path = this.resolveObjectPath(directory, filePath);
      if (STORAGE_BACKEND === "r2" ? await this.r2Exists(path) : await fileExists(path)) {
        return { path, name: filePath };
      }
    }
    return null;
  }

  async downloadObject(file: LocalObjectFile, cacheTtlSec: number = 3600): Promise<Response> {
    if (STORAGE_BACKEND === "r2") {
      const response = await this.r2Fetch("GET", file.path);
      if (response.status === 404) throw new ObjectNotFoundError();
      if (!response.ok) throw new Error(`Storage backend returned ${response.status} for "${file.path}"`);
      const meta = readR2MetaHeaders(response);
      const aclPolicy = parseAclPolicy(meta.customMetadata);
      return new Response(response.body, {
        headers: {
          "Content-Type": meta.contentType || "application/octet-stream",
          "Content-Length": meta.size !== undefined ? String(meta.size) : "",
          "Cache-Control": `${aclPolicy?.visibility === "public" ? "public" : "private"}, max-age=${cacheTtlSec}`,
        },
      });
    }

    const fileStat = await stat(file.path).catch(() => {
      throw new ObjectNotFoundError();
    });
    if (!fileStat.isFile()) throw new ObjectNotFoundError();

    const metadata = await this.readMetadata(file);
    const aclPolicy = await getObjectAclPolicy(file);
    const nodeStream = createReadStream(file.path);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": String(fileStat.size),
        "Cache-Control": `${aclPolicy?.visibility === "public" ? "public" : "private"}, max-age=${cacheTtlSec}`,
      },
    });
  }

  async getObjectEntityUploadURL(contentType: string, expectedSize: number): Promise<string> {
    const objectName = `uploads/${randomUUID()}`;
    const expires = Math.floor(Date.now() / 1000) + 900;
    const token = this.signUploadToken(objectName, expires, expectedSize, contentType);
    const path = `/api/storage/uploads/${objectName.split("/").map(encodeURIComponent).join("/")}`;
    const query = new URLSearchParams({ expires: String(expires), size: String(expectedSize), contentType, token });
    const base = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
    return `${base || ""}${path}?${query}`;
  }

  async uploadObject(
    objectName: string,
    expires: string | undefined,
    token: string | undefined,
    contentType: string | undefined,
    expectedSizeRaw: string | undefined,
    expectedContentTypeRaw: string | undefined,
    body: NodeJS.ReadableStream,
  ): Promise<void> {
    const expectedSize = Number(expectedSizeRaw);
    const expectedContentType = normalizeContentType(expectedContentTypeRaw);
    const receivedContentType = normalizeContentType(contentType);
    if (
      !Number.isSafeInteger(expectedSize) ||
      expectedSize <= 0 ||
      !expectedContentType ||
      !this.isValidUploadToken(objectName, expires, expectedSize, expectedContentType, token)
    ) {
      throw new Error("Invalid or expired upload token");
    }
    if (receivedContentType !== expectedContentType) {
      throw new UploadValidationError("Upload content type does not match the signed request");
    }

    if (STORAGE_BACKEND === "r2") {
      const key = this.resolveObjectPath(this.getPrivateObjectDir(), objectName);
      if (await this.r2Exists(key)) throw new Error("Upload destination already exists");
      const buffer = await bufferWithLimit(body, expectedSize);
      await this.r2Fetch("PUT", key, buffer, { contentType });
      return;
    }

    const destination = this.resolveObjectPath(this.getPrivateObjectDir(), objectName);
    if (await fileExists(destination)) throw new Error("Upload destination already exists");
    await mkdir(resolve(destination, ".."), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.uploading`;
    try {
      await writeStream(body, temporary, expectedSize);
      await rename(temporary, destination);
      await this.writeMetadata({ path: destination, name: objectName }, { contentType });
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalObjectFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const name = objectPath.slice("/objects/".length);
    const key = this.resolveObjectPath(this.getPrivateObjectDir(), name);

    if (STORAGE_BACKEND === "r2") {
      // Download to a local temp-cache file so existing call sites that do
      // `readFile(file.path)` / `stat(file.path)` keep working unmodified.
      const response = await this.r2Fetch("GET", key);
      if (response.status === 404) throw new ObjectNotFoundError();
      if (!response.ok) throw new Error(`Storage backend returned ${response.status} for "${key}"`);
      const cachePath = resolve(r2CacheDir, name);
      await mkdir(resolve(cachePath, ".."), { recursive: true });
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(cachePath, buffer);
      return { path: cachePath, name };
    }

    if (!(await fileExists(key))) throw new ObjectNotFoundError();
    return { path: key, name };
  }

  async saveObjectEntityBuffer(
    data: Uint8Array,
    contentType: string,
    directory = "generated",
  ): Promise<string> {
    if (!isSafeRelativePath(directory)) throw new UploadValidationError("Invalid storage directory");
    const name = `${directory}/${randomUUID()}`;

    if (STORAGE_BACKEND === "r2") {
      const key = this.resolveObjectPath(this.getPrivateObjectDir(), name);
      await this.r2Fetch("PUT", key, Buffer.from(data), { contentType });
      return `/objects/${name}`;
    }

    const path = this.resolveObjectPath(this.getPrivateObjectDir(), name);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, data, { mode: 0o600 });
    await this.writeMetadata({ path, name }, { contentType });
    return `/objects/${name}`;
  }

  async deleteObjectEntity(objectPath: string): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath).catch(() => null);
    if (!file) return;

    if (STORAGE_BACKEND === "r2") {
      const key = this.resolveObjectPath(this.getPrivateObjectDir(), file.name);
      await this.r2Fetch("DELETE", key).catch(() => undefined);
      // getObjectEntityFile() left a temp-cache copy behind; clean it up too.
      await unlink(file.path).catch(() => undefined);
      return;
    }

    await unlink(file.path).catch(() => undefined);
    await unlink(`${file.path}${metadataSuffix}`).catch(() => undefined);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;
    try {
      const url = new URL(rawPath, "http://local");
      const marker = "/storage/uploads/";
      const index = url.pathname.indexOf(marker);
      if (index >= 0) return `/objects/${url.pathname.slice(index + marker.length)}`;
    } catch {
      // Return legacy non-URL values unchanged.
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    await setObjectAclPolicy(await this.getObjectEntityFile(normalizedPath), aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId, objectFile, requestedPermission,
  }: {
    userId?: string;
    objectFile: LocalObjectFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({ userId, objectFile, requestedPermission: requestedPermission ?? ObjectPermission.READ });
  }

  async readMetadata(file: LocalObjectFile): Promise<{ contentType?: string; aclPolicy?: ObjectAclPolicy }> {
    if (STORAGE_BACKEND === "r2") {
      const key = this.resolveObjectPath(this.getPrivateObjectDir(), file.name);
      const response = await this.r2Fetch("HEAD", key);
      if (!response.ok) return {};
      const meta = readR2MetaHeaders(response);
      return { contentType: meta.contentType, aclPolicy: parseAclPolicy(meta.customMetadata) };
    }

    try {
      return JSON.parse(await readFile(`${file.path}${metadataSuffix}`, "utf8")) as { contentType?: string; aclPolicy?: ObjectAclPolicy };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async writeMetadata(file: LocalObjectFile, metadata: { contentType?: string; aclPolicy?: ObjectAclPolicy }): Promise<void> {
    if (STORAGE_BACKEND === "r2") {
      // R2 has no "patch metadata in place" operation: re-PUT the object
      // with its existing bytes plus the merged metadata. This is the path
      // used for setting ACL policy after the initial upload; the initial
      // upload itself sets contentType directly via r2Fetch(PUT, ...) and
      // never needs this round trip.
      const key = this.resolveObjectPath(this.getPrivateObjectDir(), file.name);
      const existing = await this.r2Fetch("GET", key);
      if (!existing.ok) throw new ObjectNotFoundError();
      const existingMeta = readR2MetaHeaders(existing);
      const merged = { ...parseAclPolicy(existingMeta.customMetadata) ? { aclPolicy: parseAclPolicy(existingMeta.customMetadata) } : {}, ...metadata };
      const buffer = Buffer.from(await existing.arrayBuffer());
      await this.r2Fetch("PUT", key, buffer, {
        contentType: merged.contentType ?? existingMeta.contentType,
        aclPolicy: merged.aclPolicy,
      });
      return;
    }

    await writeFile(`${file.path}${metadataSuffix}`, JSON.stringify(metadata), { mode: 0o600 });
  }

  private resolveDirectory(directory: string): string {
    if (!directory || directory.includes("\0")) throw new Error("Invalid storage directory");
    if (STORAGE_BACKEND === "r2") return directory;
    const path = resolve(storageRoot, directory);
    if (!isInside(storageRoot, path)) throw new Error("Storage directory must be inside STORAGE_ROOT");
    return path;
  }

  private resolveObjectPath(directory: string, name: string): string {
    if (!isSafeRelativePath(name) || basename(name).endsWith(metadataSuffix)) throw new ObjectNotFoundError();
    if (STORAGE_BACKEND === "r2") return `${directory}/${name}`;
    const path = resolve(directory, name);
    if (!isInside(directory, path)) throw new ObjectNotFoundError();
    return path;
  }

  private async r2Exists(key: string): Promise<boolean> {
    const response = await this.r2Fetch("HEAD", key);
    return response.ok;
  }

  /** Issue a request to the virtual R2 hostname; the Worker's outboundByHost handler resolves it against the real bucket binding. */
  private async r2Fetch(
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    key: string,
    body?: Buffer,
    opts?: { contentType?: string; aclPolicy?: ObjectAclPolicy },
  ): Promise<Response> {
    const url = `http://${r2Host}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const headers: Record<string, string> = {};
    if (opts?.contentType) headers["content-type"] = opts.contentType;
    if (opts?.aclPolicy) headers["x-object-custom-metadata"] = JSON.stringify({ aclPolicy: JSON.stringify(opts.aclPolicy) });
    return fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
  }

  private signUploadToken(objectName: string, expires: number, expectedSize: number, contentType: string): string {
    const secret = process.env.STORAGE_SIGNING_SECRET;
    if (!secret) throw new Error("STORAGE_SIGNING_SECRET must be set");
    return createHmac("sha256", secret).update(`PUT\n${objectName}\n${expires}\n${expectedSize}\n${contentType}`).digest("base64url");
  }

  private isValidUploadToken(
    objectName: string,
    expiresRaw: string | undefined,
    expectedSize: number,
    contentType: string,
    token: string | undefined,
  ): boolean {
    const expires = Number(expiresRaw);
    if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || !token || !isSafeRelativePath(objectName) || !objectName.startsWith("uploads/")) return false;
    try {
      const expected = this.signUploadToken(objectName, expires, expectedSize, contentType);
      return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    } catch { return false; }
  }
}

function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`);
}
function isSafeRelativePath(path: string): boolean {
  return !!path && !path.includes("\0") && path.split("/").every((part) => part && part !== "." && part !== ".." && !part.includes("\\"));
}
async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
function normalizeContentType(value: string | undefined): string | null {
  const normalized = value?.toLowerCase().split(";", 1)[0]?.trim();
  return normalized || null;
}
async function writeStream(input: NodeJS.ReadableStream, destination: string, expectedSize: number): Promise<void> {
  const { pipeline } = await import("stream/promises");
  const { createWriteStream } = await import("fs");
  let receivedSize = 0;
  const sizeLimiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedSize += chunk.length;
      if (receivedSize > expectedSize) {
        callback(new UploadValidationError("Upload exceeds the signed file size"));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(input, sizeLimiter, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
  if (receivedSize !== expectedSize) {
    throw new UploadValidationError("Upload size does not match the signed request");
  }
}
/** Buffers a Node readable stream in memory, enforcing the same size cap the local-disk path enforces via writeStream's Transform. Used for the r2-mode upload path, where the destination is a single fetch() PUT rather than a file handle. */
async function bufferWithLimit(input: NodeJS.ReadableStream, expectedSize: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let receivedSize = 0;
  for await (const chunk of input as AsyncIterable<Buffer>) {
    receivedSize += chunk.length;
    if (receivedSize > expectedSize) throw new UploadValidationError("Upload exceeds the signed file size");
    chunks.push(chunk);
  }
  if (receivedSize !== expectedSize) throw new UploadValidationError("Upload size does not match the signed request");
  return Buffer.concat(chunks);
}
function readR2MetaHeaders(response: Response): R2ObjectMeta {
  const customMetadataHeader = response.headers.get("x-object-custom-metadata");
  let customMetadata: Record<string, string> = {};
  if (customMetadataHeader) {
    try { customMetadata = JSON.parse(customMetadataHeader); } catch { customMetadata = {}; }
  }
  const contentLength = response.headers.get("content-length");
  return {
    contentType: response.headers.get("content-type") || undefined,
    customMetadata,
    etag: response.headers.get("etag") || undefined,
    size: contentLength ? Number(contentLength) : undefined,
  };
}
function parseAclPolicy(customMetadata: Record<string, string>): ObjectAclPolicy | undefined {
  if (!customMetadata.aclPolicy) return undefined;
  try { return JSON.parse(customMetadata.aclPolicy) as ObjectAclPolicy; } catch { return undefined; }
}
