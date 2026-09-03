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

const storageRoot = resolve(process.env.STORAGE_ROOT || "./storage");
const privateDirectory = process.env.STORAGE_PRIVATE_DIR || "private";
const publicDirectories = (process.env.STORAGE_PUBLIC_DIRS || "public")
  .split(",")
  .map((directory) => directory.trim())
  .filter(Boolean);
const metadataSuffix = ".object-metadata.json";

export interface LocalObjectFile {
  /** Absolute path on the mounted storage volume. */
  path: string;
  /** Relative path within its configured storage directory. */
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
      if (await fileExists(path)) {
        return { path, name: filePath };
      }
    }
    return null;
  }

  async downloadObject(file: LocalObjectFile, cacheTtlSec: number = 3600): Promise<Response> {
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
    const path = this.resolveObjectPath(this.getPrivateObjectDir(), name);
    if (!(await fileExists(path))) throw new ObjectNotFoundError();
    return { path, name };
  }

  async saveObjectEntityBuffer(
    data: Uint8Array,
    contentType: string,
    directory = "generated",
  ): Promise<string> {
    if (!isSafeRelativePath(directory)) throw new UploadValidationError("Invalid storage directory");
    const name = `${directory}/${randomUUID()}`;
    const path = this.resolveObjectPath(this.getPrivateObjectDir(), name);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, data, { mode: 0o600 });
    await this.writeMetadata({ path, name }, { contentType });
    return `/objects/${name}`;
  }

  async deleteObjectEntity(objectPath: string): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath);
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
    try {
      return JSON.parse(await readFile(`${file.path}${metadataSuffix}`, "utf8")) as { contentType?: string; aclPolicy?: ObjectAclPolicy };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async writeMetadata(file: LocalObjectFile, metadata: { contentType?: string; aclPolicy?: ObjectAclPolicy }): Promise<void> {
    await writeFile(`${file.path}${metadataSuffix}`, JSON.stringify(metadata), { mode: 0o600 });
  }

  private resolveDirectory(directory: string): string {
    if (!directory || directory.includes("\0")) throw new Error("Invalid storage directory");
    const path = resolve(storageRoot, directory);
    if (!isInside(storageRoot, path)) throw new Error("Storage directory must be inside STORAGE_ROOT");
    return path;
  }

  private resolveObjectPath(directory: string, name: string): string {
    if (!isSafeRelativePath(name) || basename(name).endsWith(metadataSuffix)) throw new ObjectNotFoundError();
    const path = resolve(directory, name);
    if (!isInside(directory, path)) throw new ObjectNotFoundError();
    return path;
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