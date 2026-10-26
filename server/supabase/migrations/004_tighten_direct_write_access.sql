-- Migration 004: stop the browser-reachable Postgres roles from writing tables
-- directly, and make phone-id routing deterministic.
--
-- Why: the dashboard uses supabase-js only for auth and reaches all data
-- through the server API under the service-role key. The owner UPDATE policies
-- on `businesses` and `messages` (schema.sql / migration 002) had no column
-- limit, so a client that called PostgREST directly with the public anon key
-- and a user JWT could rewrite operator-only columns the API never exposes
-- (status, vapi_phone_number, vapi_phone_id, system_prompt_override, plan,
-- monthly_fee, and message content). The server then trusts those columns for
-- call routing and suspension. See docs/security/ run 1, NV-3.
--
-- Safe to re-run.

begin;

-- 1. Remove the unrestricted owner UPDATE policies. SELECT (and FAQ full
--    access, which the owning business still controls) stay for defense in
--    depth on direct reads.
drop policy if exists "businesses_owner_update" on businesses;
drop policy if exists "messages_owner_update" on messages;

-- 2. Revoke direct writes from the browser-reachable roles on every app table,
--    and prevent later tables from being auto-granted the same privileges.
revoke insert, update, delete, truncate
  on businesses, calls, messages, appointments, faq_items
  from anon, authenticated;
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

-- 3. Routing hardening: a non-unique vapi_phone_id made findBusinessByVapiPhoneId
--    nondeterministic. Enforce uniqueness so one phone id maps to one business.
create unique index if not exists idx_businesses_vapi_phone_id_unique
  on businesses (vapi_phone_id)
  where vapi_phone_id is not null;

commit;
