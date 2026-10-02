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
app.use(express.json({
  type: (req) => !/^\/api\/admin\/(?:wiki|tc-wiki)\/import\//.test(req.url ?? "")
    && !isObjectUploadRequest(req)
    && hasContentType(req, "application/json"),
}));
app.use(express.urlencoded({
  extended: true,
  type: (req) => !isObjectUploadRequest(req) && hasContentType(req, "application/x-www-form-urlencoded"),
}));
app.use(authMiddleware);

app.use("/api/auth", planningCenterAuthRouter);
app.use("/api", router);

// Audit finding 5.2: there was no catch-all error-handling middleware, so
// any route that threw without its own try/catch fell through to Express's
// built-in default handler, which only does a bare `console.error` --
// bypassing this app's structured pino logging (and anything watching it)
// entirely. Express 5 auto-forwards a rejected async handler's promise to
// error-handling middleware (unlike Express 4, where every route had to
// catch and call next(err) itself), so this one handler now gives every
// otherwise-uncaught route error -- sync or async -- a consistent,
// log-correlated response instead of a silent console.error. Routes that
// already handle their own errors (the large majority) are unaffected;
// this is only reached when one doesn't.
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  req.log?.error({ err }, "Unhandled error reached the top-level error handler");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
