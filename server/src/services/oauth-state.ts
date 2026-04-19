import crypto from "crypto";
import { env } from "../config/env";

/**
 * Signed state tokens for OAuth `state` parameters.
 *
 * The callback is hit by Google directly and can't carry a Supabase bearer
 * token, so we can't use `requireAuth` there. Instead, the authenticated
 * start route mints a short-lived HMAC-signed token carrying the businessId
 * and the initiating userId. The callback verifies the signature and TTL
 * before writing tokens to any business row, which prevents an attacker from
 * initiating OAuth against a business they don't own.
 */

const STATE_TTL_SECONDS = 10 * 60;

function secret(): string {
  return env.OAUTH_STATE_SECRET || env.SUPABASE_SERVICE_KEY;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface OAuthStatePayload {
  bid: string;
  uid: string;
  iat: number;
  n: string;
}

export function signOAuthState(data: {
  businessId: string;
  userId: string;
}): string {
  const payload: OAuthStatePayload = {
    bid: data.businessId,
    uid: data.userId,
    iat: Math.floor(Date.now() / 1000),
    n: crypto.randomBytes(16).toString("hex"),
  };
  const payloadPart = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(
    crypto.createHmac("sha256", secret()).update(payloadPart).digest(),
  );
  return `${payloadPart}.${sig}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, sig] = parts;

  const expected = b64url(
    crypto.createHmac("sha256", secret()).update(payloadPart).digest(),
  );
  const provided = Buffer.from(sig);
  const exp = Buffer.from(expected);
  if (provided.length !== exp.length) return null;
  if (!crypto.timingSafeEqual(provided, exp)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadPart).toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload.bid !== "string" ||
    typeof payload.uid !== "string" ||
    typeof payload.iat !== "number"
  ) {
    return null;
  }

  const age = Math.floor(Date.now() / 1000) - payload.iat;
  if (age < 0 || age > STATE_TTL_SECONDS) return null;

  return payload;
}
