/**
 * Email handling for the first-login business claim.
 *
 * The claim looks up an unclaimed business by `owner_email`. PostgREST's
 * `ilike` filter passes its value through as a SQL `LIKE` pattern, where `%`,
 * `_` and `*` (which PostgREST aliases to `%`) are wildcards — and all three
 * are legal in an email local part. Using a raw address as the pattern let a
 * look-alike like `jane_doe@` match `jane.doe@`. These helpers make the match
 * literal and exact so controlling a look-alike address cannot claim another
 * tenant's business.
 */

/** Trim and lower-case an email for case-insensitive comparison. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Escape SQL LIKE metacharacters so the value matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Build the literal `ilike` pattern for an exact email match, or `null` when
 * the address cannot be matched literally. `*` is rejected because PostgREST
 * treats it as `%` and there is no way to match a literal `*` through `ilike`.
 * The caller must still re-check the returned row's `owner_email` exactly,
 * since `ilike` remains case-insensitive and escaping is easy to get wrong.
 */
export function likePatternForExactEmail(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.includes("*")) return null;
  return escapeLikePattern(normalized);
}
