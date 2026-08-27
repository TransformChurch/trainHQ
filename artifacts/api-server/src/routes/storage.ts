import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError, UploadValidationError } from "../lib/objectStorage";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireManagerOrAdmin, requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * Admin only — students cannot upload videos.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireManagerOrAdmin, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const normalizedContentType = contentType.toLowerCase().split(";", 1)[0];
    const isVideoUpload = normalizedContentType.startsWith("video/");
    const isImageUpload = normalizedContentType.startsWith("image/");
    if (!isVideoUpload && !isImageUpload) {
      res.status(415).json({ error: "Only image and video uploads are supported" });
      return;
    }

    // Media-specific checks are repeated by the signed upload endpoint.
    if (isVideoUpload) {
      const enabledRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "video_upload_enabled")).limit(1);
      const uploadEnabled = enabledRows[0]?.value !== "false";
      if (!uploadEnabled) {
        res.status(403).json({ error: "Video upload has been disabled by an administrator" });
        return;
      }

      const settingRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "max_video_upload_size_mb")).limit(1);
      const parsedMb = settingRows[0] ? parseInt(settingRows[0].value, 10) : NaN;
      const maxMb = Number.isFinite(parsedMb) && parsedMb > 0 ? parsedMb : 500;
      const maxBytes = maxMb * 1024 * 1024;
      if (size > maxBytes) {
        res.status(413).json({ error: `File size exceeds the maximum allowed size of ${maxMb} MB` });
        return;
      }
    } else {
      const maxImageBytes = getMaxImageUploadBytes();
      if (size > maxImageBytes) {
        res.status(413).json({ error: `Image exceeds the maximum allowed size of ${Math.floor(maxImageBytes / 1024 / 1024)} MB` });
        return;
      }
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL(normalizedContentType, size);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/uploads/*
 *
 * This route is intentionally unauthenticated: possession of its short-lived,
 * HMAC-signed URL authorizes one upload to the generated object name.
 */
router.put("/storage/uploads/*objectName", async (req: Request, res: Response) => {
  try {
    const raw = req.params.objectName;
    const objectName = Array.isArray(raw) ? raw.join("/") : raw;
    await objectStorageService.uploadObject(
      objectName,
      typeof req.query.expires === "string" ? req.query.expires : undefined,
      typeof req.query.token === "string" ? req.query.token : undefined,
      req.get("content-type") || undefined,
      typeof req.query.size === "string" ? req.query.size : undefined,
      typeof req.query.contentType === "string" ? req.query.contentType : undefined,
      req,
    );
    res.status(201).end();
  } catch (error) {
    req.log.warn({ err: error }, "Rejected object upload");
    res.status(error instanceof UploadValidationError ? 400 : 403)
      .json({ error: error instanceof UploadValidationError ? error.message : "Invalid, expired, or already-used upload URL" });
  }
});

function getMaxImageUploadBytes(): number {
  const configuredMb = Number.parseInt(process.env.MAX_IMAGE_UPLOAD_SIZE_MB || "", 10);
  const maxMb = Number.isSafeInteger(configuredMb) && configuredMb > 0 ? configuredMb : 20;
  return maxMb * 1024 * 1024;
}

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
