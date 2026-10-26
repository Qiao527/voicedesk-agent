import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConfigError, loadEnv } from "../../src/config/env";
import { createOAuthStateSigner } from "../../src/services/oauth-state";
import { createTokenCipher, parseEncryptionKey } from "../../src/services/token-cipher";

describe("token cipher", () => {
  const key = crypto.randomBytes(32).toString("base64");
  const tokens = { refresh_token: "1//secret", access_token: "ya29.x", expiry_date: 1 };

  it("round-trips and never stores plaintext", () => {
    const cipher = createTokenCipher(key);
    const sealed = cipher.seal(tokens, "biz-1");
    expect(JSON.stringify(sealed)).not.toContain("secret");
    expect(cipher.open(sealed, "biz-1")).toEqual(tokens);
  });

  it("binds ciphertext to the business id", () => {
    const cipher = createTokenCipher(key);
    const sealed = cipher.seal(tokens, "biz-1");
    expect(() => cipher.open(sealed, "biz-2")).toThrow();
  });

  it("detects tampering", () => {
    const cipher = createTokenCipher(key);
    const sealed = cipher.seal(tokens, "biz-1") as { data: string };
    const flipped = Buffer.from(sealed.data, "base64");
    flipped[0] ^= 1;
    expect(() => cipher.open({ ...sealed, data: flipped.toString("base64") }, "biz-1")).toThrow();
  });

  it("reads legacy plaintext rows", () => {
    expect(createTokenCipher(key).open(tokens, "biz-1")).toEqual(tokens);
  });

  it("refuses to silently return ciphertext without a key", () => {
    const sealed = createTokenCipher(key).seal(tokens, "biz-1");
    expect(() => createTokenCipher(undefined).open(sealed, "biz-1")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("accepts hex keys and rejects short ones", () => {
    expect(parseEncryptionKey(crypto.randomBytes(32).toString("hex"))).toHaveLength(32);
    expect(() => parseEncryptionKey("too-short")).toThrow();
  });
});

describe("oauth state", () => {
  const signer = createOAuthStateSigner("secret", { ttlSeconds: 600 });
  const now = Date.parse("2026-10-20T14:00:00Z");

  it("verifies its own tokens", () => {
    const state = signer.sign({ businessId: "b1", userId: "u1" }, now);
    expect(signer.verify(state, now + 1000)).toMatchObject({ bid: "b1", uid: "u1" });
  });

  it("rejects expired, tampered and foreign tokens", () => {
    const state = signer.sign({ businessId: "b1", userId: "u1" }, now);
    expect(signer.verify(state, now + 601_000)).toBeNull();

    const [payload, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ bid: "b2", uid: "u1", iat: now / 1000, n: "x" })).toString(
      "base64url",
    );
    expect(signer.verify(`${forged}.${sig}`, now)).toBeNull();
    expect(createOAuthStateSigner("other").verify(`${payload}.${sig}`, now)).toBeNull();
    expect(signer.verify("garbage", now)).toBeNull();
  });
});

describe("loadEnv", () => {
  const base = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k" };

  it("applies defaults", () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.VOICE_MODEL).toBe("claude-haiku-5-5");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("refuses to run unauthenticated webhooks in production", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(ConfigError);
    expect(() => loadEnv({ ...base, NODE_ENV: "production", VAPI_WEBHOOK_SECRET: "s" })).not.toThrow();
  });

  it("requires token encryption when calendar is enabled in production", () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", VAPI_WEBHOOK_SECRET: "s", GOOGLE_CLIENT_ID: "id" }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("treats empty strings as unset", () => {
    expect(loadEnv({ ...base, RESEND_API_KEY: "" }).RESEND_API_KEY).toBeUndefined();
  });
});
