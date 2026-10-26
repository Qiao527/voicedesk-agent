/**
 * Phone number helpers.
 *
 * Vapi's `transferCall` tool and Twilio both require E.164 ("+16175551234").
 * Owners type numbers in every format imaginable, so we normalize the common
 * North American inputs and reject anything we can't rewrite with confidence.
 */

/**
 * Normalize a free-text phone number to E.164.
 *
 *   "+44 20 7946 0958" -> "+442079460958"
 *   "(617) 555-1234"   -> "+16175551234"
 *   "1-617-555-1234"   -> "+16175551234"
 *   "555-1234"         -> null
 */
export function normalizeE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
    return `+${digits}`;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Mask a phone number for logs, keeping the last four digits so support can
 * still correlate a call without full caller PII reaching the log pipeline.
 *
 *   "+16175551234" -> "+*******1234"
 */
export function maskPhone(input: string | null | undefined): string {
  if (!input) return "[none]";
  const trimmed = String(input).trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 4) return "[invalid]";
  return `${trimmed.startsWith("+") ? "+" : ""}${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * True if two free-text numbers refer to the same line. Compared in E.164 when
 * both normalize, so "(617) 555-0199" and "+16175550199" match; otherwise
 * compared as trimmed strings. A null or empty input never matches.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  const na = normalizeE164(left);
  const nb = normalizeE164(right);
  if (na && nb) return na === nb;
  return left === right;
}

/** "+16175551234" -> "(617) 555-1234"; other formats are returned unchanged. */
export function formatPhoneForDisplay(input: string | null | undefined): string {
  if (!input) return "unknown";
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(input);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : input;
}
