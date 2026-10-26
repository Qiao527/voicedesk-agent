import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env";

/**
 * Middleware to verify Vapi webhook requests.
 *
 * Supports two modes:
 * 1. Shared secret header: Vapi sends a static secret in `x-vapi-secret`,
 *    configured via Vapi Org Settings → HTTP Headers. Compared in constant
 *    time to prevent timing attacks.
 * 2. HMAC-SHA256 signature: if Vapi ever supports body signing, the
 *    `x-vapi-signature` header is verified against the raw request body.
 *
 * In development (no secret configured), this middleware is a no-op.
 */
export function verifyVapiSignature(req: Request, res: Response, next: NextFunction) {
  const secret = env.VAPI_WEBHOOK_SECRET;

  if (!secret) {
    next();
    return;
  }

  // Mode 1: static shared secret header (Vapi HTTP Headers config)
  const sharedSecret = req.headers["x-vapi-secret"];
  if (sharedSecret && typeof sharedSecret === "string") {
    const a = Buffer.from(sharedSecret);
    const b = Buffer.from(secret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      next();
      return;
    }
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  // Mode 2: HMAC-SHA256 body signature
  const signature = req.headers["x-vapi-signature"];
  if (signature && typeof signature === "string") {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(401).json({ error: "Missing raw body for signature verification" });
      return;
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    let valid = false;
    try {
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      valid = false;
    }

    if (valid) {
      next();
      return;
    }
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // No recognized auth header present
  res.status(401).json({ error: "Missing webhook authentication" });
}
