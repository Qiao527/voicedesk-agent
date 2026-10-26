import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { createVerifyVapiRequest, type RequestWithRawBody } from "./http/middleware/verify-vapi-request";
import { createApiRouter, type ApiDeps } from "./http/routes/api";
import { serializeError } from "./lib/logger";
import { createVapiRouter } from "./vapi/router";
import type { PipelineDeps } from "./vapi/context";

export interface AppOptions {
  pipeline: PipelineDeps;
  api: Omit<ApiDeps, "repo" | "logger" | "now">;
  vapiWebhookSecret: string | undefined;
  allowedOrigins: string[];
  trustProxy: number;
  /** Disable in tests that fire many requests. */
  rateLimit?: boolean;
  version?: string;
}

export function createApp(options: AppOptions) {
  const { pipeline } = options;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy);
  app.use(helmet());

  app.use((req, res, next) => {
    const id = req.get("x-request-id") || randomUUID();
    res.setHeader("x-request-id", id);
    next();
  });

  const limiter = (limit: number) =>
    options.rateLimit === false
      ? (_req: Request, _res: Response, next: NextFunction) => next()
      : rateLimit({ windowMs: 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false });

  app.get("/ping", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health", async (_req, res) => {
    const started = Date.now();
    try {
      await pipeline.repo.ping();
      res.json({
        status: "ok",
        db: "ok",
        latencyMs: Date.now() - started,
        version: options.version,
        integrations: {
          calendar: Boolean(options.api.calendarOAuth?.configured),
          analysis: pipeline.analyzer?.name ?? null,
          sms: pipeline.notifier.channels.sms,
          email: pipeline.notifier.channels.email,
        },
      });
    } catch (err) {
      pipeline.logger.error("health.db_failed", serializeError(err));
      res.status(503).json({ status: "degraded", db: "error" });
    }
  });

  // Vapi webhooks: keep the raw body for HMAC verification. Transcripts make
  // end-of-call reports large, hence the higher limit.
  app.use(
    "/webhooks/vapi",
    limiter(600),
    express.json({
      limit: "5mb",
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = Buffer.from(buf);
      },
    }),
    createVerifyVapiRequest(options.vapiWebhookSecret),
    createVapiRouter(pipeline),
  );

  app.use(
    "/api",
    cors({ origin: options.allowedOrigins, credentials: false, maxAge: 600 }),
    limiter(300),
    express.json({ limit: "100kb" }),
    createApiRouter({ ...options.api, repo: pipeline.repo, logger: pipeline.logger, now: pipeline.now }),
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Express 5 forwards rejected promises here. Never leak internals.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number })?.status;
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ error: (err as Error).message || "Bad request" });
      return;
    }
    pipeline.logger.error("http.unhandled", {
      method: req.method,
      path: req.path,
      requestId: res.getHeader("x-request-id"),
      ...serializeError(err),
    });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
