import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { authMiddleware } from "./middlewares/auth";
import router from "./routes";
import { logger } from "./lib/logger";
import planningCenterAuthRouter from "./routes/planningCenterAuth";

const app: Express = express();
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const allowCredentials = process.env.CORS_ALLOW_CREDENTIALS === "true";
const frameAncestors = (process.env.FRAME_ANCESTORS ?? "'self'")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isObjectUploadRequest = (req: { method?: string; url?: string }) =>
  req.method === "PUT" && req.url?.startsWith("/api/storage/uploads/");
const hasContentType = (req: { headers: { ["content-type"]?: string | string[] } }, value: string) => {
  const contentType = req.headers["content-type"];
  return (Array.isArray(contentType) ? contentType[0] : contentType)?.includes(value) ?? false;
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use((_, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    `frame-ancestors ${frameAncestors.join(" ") || "'self'"}`,
  );
  next();
});
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header are same-origin/server-to-server calls.
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: allowCredentials,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
}));
// Direct object uploads must remain an unread stream, including uploads whose
// file MIME type happens to be JSON or form data.
app.use(express.json({ type: (req) => !isObjectUploadRequest(req) && hasContentType(req, "application/json") }));
app.use(express.urlencoded({
  extended: true,
  type: (req) => !isObjectUploadRequest(req) && hasContentType(req, "application/x-www-form-urlencoded"),
}));
app.use(authMiddleware);

app.use("/api/auth", planningCenterAuthRouter);
app.use("/api", router);

export default app;
