/**
 * Phone number helpers.
 *
 * Vapi's `transferCall` built-in tool requires an E.164-formatted destination
 * (e.g. "+16175551234"). If we hand it a locally-formatted string the transfer
 * fails silently and the caller hears awkward dead air. This helper normalizes
 * the common inputs that owners actually type ("617-555-1234", "(617) 555-1234",
 * "+1 617 555 1234") and rejects anything we can't confidently rewrite.
 */

/**
 * Normalize a free-text phone number to E.164 (e.g. "+16175551234").
 *
 * Rules:
 *   - Strips any non-digit character except a single leading "+".
 *   - Already-E.164 (leading "+" then 8–15 digits) → returned as-is.
 *   - Exactly 10 digits → assumed US/Canada, "+1" prepended.
 *   - Exactly 11 digits starting with "1" → "+" prepended.
 *   - Anything else → null.
 *
 * Returns null for any input we can't unambiguously convert. Callers must
 * treat null as "no valid destination" and degrade gracefully.
 */
export function normalizeE164(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

export function isE164(input: string | null | undefined): boolean {
  return normalizeE164(input) === (input ?? null);
}

/**
 * Mask a phone number for logging. Keeps the last 4 digits so we can correlate
 * support/debugging without leaking full PII to log aggregators.
 *   "+16175551234" → "+*******1234"
 *   "abc"          → "[invalid]"
 *   null/""        → "[none]"
 */
export function maskPhone(input: string | null | undefined): string {
  if (!input) return "[none]";
  const trimmed = String(input).trim();
  if (!trimmed) return "[none]";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 4) return "[invalid]";
  const hasPlus = trimmed.startsWith("+");
  const last4 = digits.slice(-4);
  const maskedLen = digits.length - 4;
  return `${hasPlus ? "+" : ""}${"*".repeat(maskedLen)}${last4}`;
}
