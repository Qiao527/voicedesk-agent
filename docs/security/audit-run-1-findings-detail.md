# Confirmed findings — detail

Source: `Qiao527/voicedesk-agent` at `8992deb`. Paths are repository-relative. Every reproduction ran in the no-network sandbox with dummy data; no deployed service was touched.

---

## F-1 (medium) First-login business claim matches the email as an ILIKE pattern

**Fingerprint:** `server/src/repositories/supabase-repository.ts:findBusinessIdForUser:ilike-unescaped-email-claim`

**Invariant:** only the user whose email equals `owner_email` (case-insensitively) may claim an unclaimed business.

### Trace
1. `entrypoint` — `server/src/http/middleware/require-auth.ts:26`: bearer token from any `/api` request (routed through `require-auth` at `api.ts:164`).
2. `propagation` — `server/src/index.ts:92`: `supabase.auth.getUser(token)` reduced to `{ id, email }`; the email is the attacker's registered address.
3. `propagation` — `server/src/http/middleware/require-auth.ts:38`: `findBusinessIdForUser(user)` runs on every authenticated request.
4. `propagation` — `server/src/repositories/supabase-repository.ts:81`: unclaimed rows filtered with `.ilike("owner_email", user.email)`, `order(created_at).limit(1)` — the raw email is a LIKE pattern.
5. `propagation` — `server/src/repositories/supabase-repository.ts:90`: the match is updated to `owner_user_id = attacker`, so the claim persists.
6. `sink` — `server/src/http/middleware/require-auth.ts:44`: `req.auth.businessId` becomes the victim business for every route (`GET /business` at `api.ts:182`, `PATCH /business` at `api.ts:191`).

### Affected principal / resource
A self-registered dashboard user with no relationship to the business takes over another tenant: its calls, transcripts, recordings, messages, appointments and FAQs, plus `owner_phone` (SMS and live-transfer target) and `owner_email`. The real owner is locked out with 403.

### Reproduction (bounded, local)
Load `server/supabase/schema.sql` into PGlite with a stub `auth` schema; insert unclaimed businesses (oldest `owner_email = jane.doe@example.com`). Build the real app with `createApp` + `createSupabaseRepository` over a real `supabase-js` client whose `fetch` runs each emitted PostgREST request in PGlite (`eq`→`=`, `is.null`→`IS NULL`, `ilike`→`ILIKE` with `*`→`%`). As `jane_doe@example.com`, call `GET /api/business`.

**Observed:** `jane_doe@example.com` and `%@example.com` each got HTTP 200 with the victim business and set `owner_user_id` to the attacker; the real `jane.doe@example.com` then got 403. PGlite confirmed `'jane.doe@example.com' ILIKE 'jane_doe@example.com'` and `ILIKE '%@example.com'` are both true. The in-memory repository control returned 403 and left `owner_user_id` null. With the fix applied, the look-alike and wildcard claims returned 403 while `JANE.DOE@example.com` still claimed the business. Evidence: `agents/hunter-api-auth/artifacts/check-1.log`, `agents/verify-4/artifacts/check-1.log`.

### Conditions
Target `owner_user_id` is NULL (after onboarding, before first sign-in, or after the owner's auth user is deleted via `schema.sql:14 on delete set null`); attacker holds a Supabase session for a pattern-matching, receivable address on the same domain; sign-ups are open; attacker acts before the owner's first sign-in.

### Invariant it proves
A persistent cross-account binding and owner lockout from an unescaped user-controlled pattern used as an authorization selector.

### Remediation
Exact, case-insensitive match: reject `*`, escape `\ % _`, re-check the returned `owner_email` against the caller's email, and require the conditional claim to affect exactly one row (so a losing concurrent claimer gets nothing). Longer term, store `owner_email` lower-cased and use `eq`, or replace email matching with an operator-issued one-time claim token. Regression: against a PostgREST-backed fixture, `jane_doe@` and `%@` must get 403 and leave `owner_user_id` NULL, while `JANE.DOE@` still claims. (Mailbox-ownership proof is a separate lead, NV-2.)

```ts
// server/src/repositories/supabase-repository.ts — findBusinessIdForUser (email branch)
if (!user.email) return null;
const email = user.email.trim().toLowerCase();
if (email.includes("*")) return null;                     // PostgREST aliases * to %
const literal = email.replace(/[\\%_]/g, (c) => `\\${c}`); // escape LIKE metacharacters
const byEmail = await db.from("businesses").select("id, owner_email")
  .is("owner_user_id", null).ilike("owner_email", literal)
  .order("created_at", { ascending: true }).limit(1).maybeSingle();
const unclaimed = unwrap("findBusinessIdForUser", byEmail) as { id: string; owner_email: string | null } | null;
if (!unclaimed || unclaimed.owner_email?.trim().toLowerCase() !== email) return null;
const claim = await db.from("businesses").update({ owner_user_id: user.id })
  .eq("id", unclaimed.id).is("owner_user_id", null).select("id");
return (unwrap("claimBusiness", claim) as unknown[] | null)?.length === 1 ? unclaimed.id : null;
```

---

## F-2 (low) Google OAuth callback is not bound to the completing session

**Fingerprint:** `server/src/http/routes/api.ts:auth-google-callback:state-not-bound-to-completing-session`

**Invariant:** Google tokens are stored only when the same authenticated dashboard user, for the business that started the flow, completes it — once.

### Trace
1. `entrypoint` — `server/src/http/routes/api.ts:167` (`GET /auth/google/start`): an authenticated owner of any business mints a state.
2. `propagation` — `api.ts:173`: the state (`{bid, uid, iat, n}`) is embedded in the returned Google URL; no cookie or server record is created.
3. `propagation` — `api.ts:137` (`GET /auth/google/callback`, public, mounted before `requireAuth`): receives any browser carrying a code and a valid state.
4. `propagation` — `server/src/services/oauth-state.ts:39`: `verify` checks only HMAC, field types and a 600 s age; the nonce is ignored and not consumed.
5. `propagation` — `api.ts:150`: `business.owner_user_id === state.uid` — both identify the initiator, so it passes regardless of who completes.
6. `sink` — `server/src/services/calendar.ts:166`: tokens from the completing account are sealed onto the initiating business.

### Affected principal / resource
The initiating business gains free/busy visibility into, and event insertion into, the completing Google account's primary calendar, until the grant is revoked. Tokens stay encrypted and are never returned by the API.

### Reproduction (bounded, local)
Real `createApp`, `createOAuthStateSigner`, `createTokenCipher` (dummy key) and `createGoogleCalendar`; `OAuth2Client.prototype.getToken` patched in-process to map each dummy code to a dummy refresh token (no network). Mint a state via `/start`, then call the callback from a client with no `Authorization` header and no cookie.

**Observed:** 302 to `/settings?google_calendar=connected`; the initiating business's tokens decrypted (with its business id as AAD) to the completing account's refresh token; replaying the same state with a second code was also accepted; downstream `check_availability` and `book_appointment` used the completing account's token. Forged/expired/mismatched states were rejected. Evidence: `agents/hunter-api-auth/artifacts/check-2.log`, `agents/verify-2/artifacts/check-1.log`.

### Remediation
Point `GOOGLE_REDIRECT_URI` at a dashboard route that strips `code`/`state` from the URL and POSTs them with the owner's bearer token to a new authenticated endpoint; require `state.uid === auth(req).userId` and `state.bid === auth(req).businessId`; atomically consume `state.n` (TTL-bounded) before the code exchange; remove the public GET callback. The code is still exchanged server-side with the client secret, so no trust moves to the client. Regression: reject a state minted by user A when completed with no token or user B's token; reject a second completion of the same state; keep the forged/expired/mismatch rejections.
