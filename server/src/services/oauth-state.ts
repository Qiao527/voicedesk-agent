import crypto from "node:crypto";

/**
 * Signed, short-lived OAuth `state` tokens.
 *
 * Google redirects the browser to our callback without a Supabase session, so
 * the callback can't use `requireAuth`. The authenticated start route mints a
 * token binding the business and user; the callback only writes tokens for a
 * business if the HMAC and TTL check out. This blocks OAuth CSRF and stops a
 * user from attaching their calendar to someone else's business.
 */

export interface OAuthStatePayload {
  bid: string;
  uid: string;
  iat: number;
  n: string;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function createOAuthStateSigner(secret: string, options: { ttlSeconds?: number } = {}) {
  const ttl = options.ttlSeconds ?? 10 * 60;
  const sign = (payloadPart: string) =>
    b64url(crypto.createHmac("sha256", secret).update(payloadPart).digest());

  return {
    sign(data: { businessId: string; userId: string }, now = Date.now()): string {
      const payload: OAuthStatePayload = {
        bid: data.businessId,
        uid: data.userId,
        iat: Math.floor(now / 1000),
        n: crypto.randomBytes(16).toString("hex"),
      };
      const payloadPart = b64url(Buffer.from(JSON.stringify(payload)));
      return `${payloadPart}.${sign(payloadPart)}`;
    },

    verify(state: string, now = Date.now()): OAuthStatePayload | null {
      const parts = state.split(".");
      if (parts.length !== 2) return null;
      const [payloadPart, sig] = parts;

      const expected = Buffer.from(sign(payloadPart));
      const provided = Buffer.from(sig);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return null;
      }

      let payload: OAuthStatePayload;
      try {
        payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (
        typeof payload?.bid !== "string" ||
        typeof payload.uid !== "string" ||
        typeof payload.iat !== "number"
      ) {
        return null;
      }

      const age = Math.floor(now / 1000) - payload.iat;
      if (age < 0 || age > ttl) return null;
      return payload;
    },
  };
}

export type OAuthStateSigner = ReturnType<typeof createOAuthStateSigner>;
