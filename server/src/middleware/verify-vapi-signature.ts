import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env";

/**
 * Middleware to verify Vapi webhook signatures.
 *
 * Vapi signs each webhook POST with HMAC-SHA256 using the shared secret.
 * The signature is sent in the `x-vapi-signature` header.
 *
 * In development (no secret configured), this middleware is a no-op
 * so you can test with curl / Postman.
 */
export function verifyVapiSignature(req: Request, res: Response, next: NextFunction) {
  const secret = env.VAPI_WEBHOOK_SECRET;

  if (!secret) {
    next();
    return;
  }

  const signature = req.headers["x-vapi-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  // Hash the exact bytes Vapi signed. express.json's `verify` callback in
  // index.ts stashes the raw buffer on req.rawBody before JSON parsing.
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(401).json({ error: "Missing raw body for signature verification" });
    return;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual throws if buffer lengths differ — always return 401, never 500
  let valid = false;
  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    valid = false;
  }

  if (!valid) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  next();
}
