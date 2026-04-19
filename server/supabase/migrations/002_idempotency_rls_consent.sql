-- Migration: webhook idempotency, row-level security, and recording consent.
-- Safe to re-run — every change uses "if not exists" or "create policy if not exists".

-- ─── 1. Idempotency for Vapi webhook retries ─────────────────────────
-- Vapi retries webhooks on transient failure. Without unique indexes we would
-- insert duplicate call rows and double-book Google Calendar events.

-- Same Vapi call id can only appear once in the calls table.
create unique index if not exists idx_calls_vapi_call_id_unique
  on calls(vapi_call_id)
  where vapi_call_id is not null;

-- Same (call, start_time) can only produce one appointment row.
create unique index if not exists idx_appointments_call_start_unique
  on appointments(_vapi_call_id, start_time)
  where _vapi_call_id is not null;

-- ─── 2. Call recording consent disclosure ────────────────────────────
-- Two-party consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA) require
-- the caller be told the call may be recorded. Stored per-business so owners
-- can translate or adjust, but defaulted to a safe phrase.

alter table businesses
  add column if not exists recording_disclosure text
  default 'This call may be recorded for quality and scheduling.';

-- Backfill existing rows with the default (add column default doesn't
-- retroactively fill NULLs in some Postgres versions).
update businesses
  set recording_disclosure = 'This call may be recorded for quality and scheduling.'
  where recording_disclosure is null;

-- ─── 3. Row-Level Security ───────────────────────────────────────────
-- Defense in depth. Our Express server uses the service_role key, which
-- bypasses RLS — so none of the server-side code paths change behavior. The
-- policies protect against any future code path (or mistake) that queries
-- tables using the anon/authenticated role directly from the browser.

alter table businesses    enable row level security;
alter table calls         enable row level security;
alter table messages      enable row level security;
alter table appointments  enable row level security;
alter table faq_items     enable row level security;

-- Owners can only see / update their own business row.
drop policy if exists "businesses_owner_select" on businesses;
create policy "businesses_owner_select" on businesses for select
  using (auth.uid() = owner_user_id);

drop policy if exists "businesses_owner_update" on businesses;
create policy "businesses_owner_update" on businesses for update
  using (auth.uid() = owner_user_id);

-- Calls: read only.
drop policy if exists "calls_owner_select" on calls;
create policy "calls_owner_select" on calls for select
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

-- Messages: read + mark-as-read.
drop policy if exists "messages_owner_select" on messages;
create policy "messages_owner_select" on messages for select
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

drop policy if exists "messages_owner_update" on messages;
create policy "messages_owner_update" on messages for update
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

-- Appointments: read only from dashboard. Writes come from the server
-- (service role, bypasses RLS).
drop policy if exists "appointments_owner_select" on appointments;
create policy "appointments_owner_select" on appointments for select
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

-- FAQs: full CRUD for the owning business.
drop policy if exists "faq_items_owner_all" on faq_items;
create policy "faq_items_owner_all" on faq_items for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_user_id = auth.uid()));
