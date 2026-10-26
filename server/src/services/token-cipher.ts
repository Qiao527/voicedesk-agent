import crypto from "node:crypto";

/**
 * Envelope stored in `businesses.google_calendar_tokens` when encryption at
 * rest is enabled. AES-256-GCM gives confidentiality and tamper detection;
 * the business id is bound in as associated data so a ciphertext copied onto
 * another business row fails to decrypt.
 */
export interface EncryptedEnvelope {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
}

export interface TokenCipher {
  readonly enabled: boolean;
  seal(value: unknown, businessId: string): unknown;
  open(stored: unknown, businessId: string): unknown;
}

function isEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as EncryptedEnvelope).alg === "aes-256-gcm" &&
    typeof (value as EncryptedEnvelope).data === "string"
  );
}

/** Accepts a 32-byte key as base64 or hex (`openssl rand -base64 32`). */
export function parseEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const candidates = [
    /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : null,
    Buffer.from(trimmed, "base64"),
  ];
  const key = candidates.find((k) => k?.length === 32);
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, encoded as base64 or hex");
  return key;
}

export function createTokenCipher(rawKey: string | undefined): TokenCipher {
  if (!rawKey) {
    return {
      enabled: false,
      seal: (value) => value,
      open: (stored) => {
        if (isEnvelope(stored)) {
          throw new Error("Calendar tokens are encrypted but TOKEN_ENCRYPTION_KEY is not set");
        }
        return stored;
      },
    };
  }

  const key = parseEncryptionKey(rawKey);

  return {
    enabled: true,
    seal(value, businessId) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(businessId));
      const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
      const envelope: EncryptedEnvelope = {
        v: 1,
        alg: "aes-256-gcm",
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64"),
      };
      return envelope;
    },
    open(stored, businessId) {
      // Rows written before encryption was enabled are plain JSON. Read them
      // as-is; they are re-sealed the next time tokens are saved.
      if (!isEnvelope(stored)) return stored;
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(stored.iv, "base64"));
      decipher.setAAD(Buffer.from(businessId));
      decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
      const plain = Buffer.concat([decipher.update(Buffer.from(stored.data, "base64")), decipher.final()]);
      return JSON.parse(plain.toString("utf8"));
    },
  };
}
