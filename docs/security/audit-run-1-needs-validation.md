# Needs validation — prioritized leads

Each lead has a source-grounded trace but turns on a deployment fact the repository does not contain. None has a severity. The owner-observed checks below are read-only and non-destructive. All three are also fixed at the source level on the `release/v1.1` branch, which removes the dependency on the unknown.

---

## NV-1 Webhook authentication is skipped when `VAPI_WEBHOOK_SECRET` is unset and `NODE_ENV` is not exactly `production`

**Fingerprint:** `server/src/http/middleware/verify-vapi-request.ts:createVerifyVapiRequest:fail-open-when-secret-unset-outside-NODE_ENV-production`

**Trace:** `createVerifyVapiRequest` calls `next()` for every request when no secret is set (`verify-vapi-request.ts:26`). The boot guard rejects a missing secret only when `NODE_ENV === "production"` (`config/env.ts:51`); `NODE_ENV` defaults to `development`. `server/.env.example` ships `NODE_ENV=development` with an empty secret, `docs/deployment.md:31`'s `docker run --env-file .env` lets that value override the image's `ENV NODE_ENV=production`, and the Railway/Nixpacks path sets no `NODE_ENV` in source. In the open state, locally reproduced, an uncredentialed `POST /webhooks/vapi` returned the tenant assistant (with `owner_phone` as the transfer destination) and ran `take_message`, `book_appointment` and `end-of-call-report`.

**Blockers:** the deployed `NODE_ENV` and whether the secret is set; whether Railway injects `NODE_ENV=production`.

**Owner-observed check:** inspect each running instance's environment (Railway Variables, or `docker inspect`) for a non-empty `VAPI_WEBHOOK_SECRET` and `NODE_ENV=production`; search logs since first deploy for `startup.webhook_auth_disabled`; confirm each Vapi number carries an `X-Vapi-Secret`/Bearer credential. Optionally POST a credential-free `{"message":{"type":"status-update","call":{"id":"owner-check"}}}` (no side effect): 401 = protected, 200 = open.

**Source fix (applied):** `loadEnv` throws when `VAPI_WEBHOOK_SECRET` is unset, regardless of `NODE_ENV`, unless `ALLOW_UNAUTHENTICATED_WEBHOOKS=true` is set explicitly; that opt-out is itself rejected when `NODE_ENV=production`.

---

## NV-2 The email claim trusts a Supabase email-confirmation setting the source neither sets nor checks

**Fingerprint:** `server/src/repositories/supabase-repository.ts:findBusinessIdForUser:email-claim-trusts-unverified-signup`

**Trace:** `verifyToken` keeps only `{ id, email }` from `supabase.auth.getUser` (`index.ts:92`), discarding `email_confirmed_at`; `findBusinessIdForUser` claims an unclaimed business on an email match alone (`supabase-repository.ts:77-92`). Whether a session can exist without mailbox proof is a Supabase project setting absent from the repo and from `docs/deployment.md`. If confirmation is off, anyone who knows an onboarding `owner_email` can sign up with the public anon key and claim that business before its owner. This compounds F-1.

**Blockers:** the project's Auth settings (Confirm email, unverified sign-ins, enabled providers); no local Auth server to observe token issuance.

**Owner-observed check:** in Supabase → Authentication → Sign In / Providers, confirm Email "Confirm email" is on, unverified sign-ins are disallowed, and every enabled provider supplies verified emails. Optionally, on a non-production project with identical settings, sign up an address equal to a dummy unclaimed `owner_email` without confirming; if `GET /api/business` then returns 200, it is reachable.

**Source fix (applied):** `verifyToken` returns `email_confirmed_at`, and the claim path refuses to bind a business for an unconfirmed email.

---

## NV-3 Owner UPDATE RLS policies on `businesses` and `messages` have no column limits

**Fingerprint:** `server/supabase/schema.sql:owner-update-policy-unrestricted-columns`

**Trace:** the dashboard API limits owner edits to `BusinessUpdateSchema` (no `status`, `vapi_phone_number`, `vapi_phone_id`, `system_prompt_override`, `plan`, `monthly_fee`) and messages to `is_read`. The RLS policy `businesses_owner_update` (`schema.sql:153`, re-created in migration 002) has only `USING (auth.uid() = owner_user_id)`; Postgres reuses it as the check, pinning `owner_user_id` and no other column. If the deployed project grants `UPDATE` on these tables to `authenticated` and exposes the public schema through PostgREST, a tenant owner can PATCH their own row directly with the anon key (shipped in the bundle) and their JWT. The service-role webhook path then trusts `status` and the routing columns. Locally (with Supabase-style default privileges) an owner flipped `status` `paused`→`active` and wrote another tenant's number into `vapi_phone_number`; the real app then served the attacker's assistant on the victim's number and stored the victim's call under the attacker. With source-only privileges (no GRANTs), every direct statement — and the server's own lookup — was denied, so the gap depends entirely on the deployed grants.

**Blockers:** table privileges for `anon`/`authenticated` (no GRANT/REVOKE in source); whether the public schema is exposed through the Data API; for the capture variant, whether any active tenant row lacks the exact dialed-number string and whether Vapi sends `phoneNumber.number`.

**Owner-observed check (read-only SQL):** `role_table_grants` and `column_privileges` for `anon`/`authenticated` on `public.*`; whether `public` is an exposed schema in Data API settings; `select id from businesses where status='active' and (vapi_phone_number is null or vapi_phone_number !~ '^\+[1-9][0-9]{7,14}$')`; duplicate `vapi_phone_id`.

**Source fix (applied):** the dashboard never queries tables directly (only `supabase.auth`), so migration 004 drops both owner UPDATE policies and revokes `insert/update/delete/truncate` on the public tables from `anon` and `authenticated`, and alters default privileges so later tables are not re-granted. Verified locally to deny the status/routing/message writes while the owner's own-row SELECT still works.
