import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type RequestWithRawBody = Request & { rawBody?: Buffer };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Authenticate Vapi webhooks. Accepts any of the credential styles Vapi can
 * be configured to send:
 *
 * 1. `X-Vapi-Secret: <secret>` (legacy inline secret / Bearer credential
 *    with a custom header name)
 * 2. `Authorization: Bearer <secret>` (Bearer Token custom credential)
 * 3. `X-Vapi-Signature: <hex hmac-sha256 of raw body>` (HMAC credential)
 *
 * Comparisons are constant-time. With no secret configured (local dev only;
 * production refuses to boot without one) the check is skipped.
 */
export function createVerifyVapiRequest(secret: string | undefined) {
  return function verifyVapiRequest(req: Request, res: Response, next: NextFunction) {
    if (!secret) {
      next();
      return;
    }

    const shared = req.get("x-vapi-secret");
    if (shared !== undefined) {
      if (safeEqual(shared, secret)) return next();
      res.status(401).json({ error: "Invalid webhook secret" });
      return;
    }

    const auth = req.get("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      if (safeEqual(auth.slice(7).trim(), secret)) return next();
      res.status(401).json({ error: "Invalid webhook token" });
      return;
    }

    const signature = req.get("x-vapi-signature");
    if (signature !== undefined) {
      const raw = (req as RequestWithRawBody).rawBody;
      if (!raw) {
        res.status(401).json({ error: "Missing body for signature verification" });
        return;
      }
      const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
      const provided = signature
        .replace(/^sha256=/i, "")
        .trim()
        .toLowerCase();
      if (safeEqual(provided, expected)) return next();
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    res.status(401).json({ error: "Missing webhook authentication" });
  };
}
