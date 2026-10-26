# VoiceDesk security audit — run 1

## 1. Run facts

- **Target:** `Qiao527/voicedesk-agent` at `8992deb` (clean `git archive`; dependencies installed with `npm ci --ignore-scripts`).
- **Profile:** `quick` (one hunter wave + one final coverage critic). This is a partial pass, not a proof of absence.
- **Scope:** `server/src`, `server/supabase`, `dashboard/src`, `dashboard/vercel.json`, `.github`, `server/Dockerfile`. Deployment platforms (Supabase project settings, Railway, Vercel, Vapi, Google, Twilio, Resend) are outside source and recorded as `needs_validation` where decisive.
- **Execution policy:** source-and-local-only. Every local check ran in a bubblewrap sandbox with no network, an empty allowlisted environment, a read-only target, scratch-only writes, and CPU/memory/file-size/wall-clock limits. No deployed endpoint, provider API, or shared service was contacted.
- **Agents spent:** 4 reconnaissance + 4 hunters + 1 final critic + 5 candidate verifiers = 14 (budget 18).
- **Prior runs:** none. This is the first ledger for the repository.
- **Validators:** `validate-findings.cjs` and `validate-coverage-ledger.cjs` both pass.

## 2. Security posture

VoiceDesk is built with the right instincts: a webhook credential check with a constant-time compare, strict zod schemas on every dashboard write, server-side business scoping on every repository query, HMAC-signed OAuth state, AES-256-GCM encryption of Google tokens, HTML escaping in owner emails, React text nodes for all caller- and model-supplied strings, a least-privilege CI token, and a non-root container. The post-call LLM analysis is treated as untrusted and has no authority: it writes only text fields, enums and booleans for the call's own business.

The findings cluster in one place: the boundary between a Supabase-authenticated dashboard user and the business they are allowed to act as. The first-login email claim matches too loosely (confirmed), and three further weaknesses turn on deployment facts the repository cannot see — whether the webhook secret is set, whether Supabase enforces email confirmation, and what table privileges the database grants to the `authenticated` role.

## 3. Confirmed findings

| Severity | Title | Boundary | Observed result |
| --- | --- | --- | --- |
| medium | First-login business claim matches the email as an ILIKE pattern | Supabase user → business | A user registered as `jane_doe@` claimed the business onboarded for `jane.doe@`; the real owner was then locked out with 403. |
| low | Google OAuth callback is not bound to the session that started it | Dashboard user → a business's calendar connection | A grant completed in a different browser attached that Google account's calendar to the initiating business; the state was also replayable within its 10-minute TTL. |

### 3.1 First-login business claim treats the email as an ILIKE pattern (medium)

`findBusinessIdForUser` claims an unclaimed business with `.ilike("owner_email", user.email)` (`server/src/repositories/supabase-repository.ts:81`). PostgREST runs the value as a SQL `ILIKE` pattern, and `_`, `%` and `*` (which PostgREST aliases to `%`) are all legal in an email local part. A dashboard user whose address, read as a pattern, matches an unclaimed `owner_email` on the same domain claims that business, gets its calls, transcripts, messages and appointments, and can repoint `owner_phone` (the SMS and live-transfer target). The real owner then receives 403.

Two independent local runs drove the real Express app, the real `supabase-js` client, and real Postgres `ILIKE` semantics (`schema.sql` loaded into PGlite). `jane_doe@example.com` and `%@example.com` both claimed the business set up for `jane.doe@example.com`; the in-memory repository used by the test suite (exact equality) correctly returned 403, which is why the existing tests miss this. Likelihood is **low** (needs an unclaimed business, a matching receivable address, and action before the owner's first sign-in); impact is **high** (full tenant takeover); overall **medium**. The smallest fix is exact, case-insensitive matching with escaped metacharacters and a re-check of the returned `owner_email`; the fix was verified to deny the look-alike claims while still allowing the correct owner.

### 3.2 Google OAuth callback is not bound to the completing session (low)

`GET /api/auth/google/start` signs a state with the caller's business and user id; the public `GET /api/auth/google/callback` then accepts any request carrying a valid, unexpired state and seals the exchanged Google tokens onto that business (`server/src/http/routes/api.ts:137-162`, `server/src/services/oauth-state.ts`). Nothing ties completion to the browser or user that started the flow: no cookie is set, the nonce is never stored, and the state is not single-use. A local run of the real routes, state signer, calendar service and token cipher showed a grant completed from a session-less client — and a replay within the TTL — attaching the completing Google account's calendar to the initiating business. Impact is bounded (tokens stay encrypted and are never returned; the attacker's own tenant gains free/busy visibility and event insertion into the victim's primary calendar until the grant is revoked), so overall **low**. The fix binds completion to the authenticated owner through a dashboard-mediated exchange and makes the state single-use.

## 4. Needs validation

These are source-grounded leads whose exploitability depends on a deployment fact the repository does not contain. They have no severity. Each has a bounded owner-observed check in `NEEDS-VALIDATION.md`.

| Lead | Decisive unknown |
| --- | --- |
| Webhook auth is skipped when `VAPI_WEBHOOK_SECRET` is unset and `NODE_ENV` is not exactly `production` | The deployed server's effective `NODE_ENV` and whether the secret is set |
| The email claim trusts a Supabase email-confirmation setting the source neither sets nor checks | Whether the Supabase project enforces email confirmation |
| The `businesses`/`messages` owner UPDATE RLS policies have no column limits | Whether the project grants `UPDATE` on those tables to the `authenticated` role and exposes the public schema through PostgREST |

All three are worth fixing at the source level regardless of the deployment answer, because the fixes remove the dependency on an unversioned setting: fail-closed webhook auth with an explicit opt-out, an `email_confirmed_at` check plus an exact claim, and dropping the unused direct-write policies.

## 5. Hardening notes (confirmed-safe today, worth tightening)

Drawn from the hunters' non-finding observations:

- **Non-atomic booking.** `book_appointment` runs `listBusy` then `createEvent` without a reservation, and a single `tool-calls` message runs its calls with `Promise.all`; overlapping and same-slot double bookings were reproduced. Any caller may already book any free slot, so this is availability hygiene, not a boundary break. Reserve the slot in the DB (an exclusion constraint on `tstzrange`) and run side-effecting tools sequentially.
- **Booking horizon** is enforced only in `check_availability`; `book_appointment` accepted dates in 2027 and 2099. Apply the 90-day horizon in both.
- **Orphan calendar events.** The Google event is created before the appointment row; a retry leaves a duplicate event. Insert the row first, then the event.
- **`HANDLERS[name]` is a plain-object lookup**, so `constructor` resolves. No side effect is reachable, but use `Object.hasOwn` or a `Map`.
- **No replay protection** on webhook auth (no timestamp/nonce); idempotency keys bound the damage. A redelivered end-of-call report re-runs the paid Claude analysis and can overwrite an owner-set `follow_up_required`. Skip analysis when the call already has it.
- **`vapi_phone_id` is not unique** and the lookup is `limit(1)` with no order. Add a unique constraint.
- **Unbounded reads:** `GET /analytics/summary` selects `*` for up to 5000 call rows (transcripts, analysis) though it needs six columns. Select only what it aggregates.
- **No `frame-ancestors`/`X-Frame-Options`** on the dashboard host; browser storage partitioning currently prevents a framed authenticated session. Add the headers for defense in depth.
- **Analyzer `caller_name` is unbounded** before it reaches the SMS `From:` line and email subject; clamp and strip control characters.

## 6. Positive patterns worth keeping

Server-side tenant scoping in one repository layer; strict zod write schemas; the analyzer-as-untrusted design; AES-GCM with the business id as associated data; constant-time credential checks; the least-privilege, no-secrets CI and the SHA-pinning Dependabot follow-up.

## 7. Coverage summary

19 ledger units: **6 covered**, **4 candidate** (the findings above), **9 deferred**. The 9 deferred are surfaces the single quick-profile wave did not open (owner-chosen notification destinations as an operator-spend vector; the unauthenticated `/health` and error-handler checklist; calendar disconnect vs. in-flight token refresh; owner-removal and offboarding lifecycle; voice-model context extraction of `owner_phone`; authenticated read amplification; the IP-keyed rate-limit bucket shared across tenants; cross-tenant integrity of the `_vapi_call_id` joins; and caller tool-argument text flowing into the calendar event and SMS). They are recorded with reasons for a later `standard` or `deep` run. Exclusions: no native code (memory-safety), no local IPC (desktop/mobile), and deployment-only cloud configuration. The final coverage critic accepted six of these as `missing_units` and proposed no reassignments; under the quick profile they are deferred rather than hunted.

This run found what one pass finds. A second run against the same source typically roughly doubles total coverage; the deferred units are the place to start.
