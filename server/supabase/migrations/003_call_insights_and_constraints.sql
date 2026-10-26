-- Migration 003: post-call analysis, owner notification idempotency,
-- per-business appointment length, and constraint fixes.
-- Safe to re-run.

begin;

-- ─── 1. Call insights ────────────────────────────────────────────────
alter table calls add column if not exists follow_up_required boolean not null default false;
alter table calls add column if not exists analysis jsonb;
-- Set exactly once per call so Vapi webhook retries never re-send the owner SMS.
alter table calls add column if not exists owner_notified_at timestamptz;

-- ─── 2. Business settings ────────────────────────────────────────────
alter table businesses add column if not exists appointment_duration_min integer not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_appointment_duration_check') then
    alter table businesses
      add constraint businesses_appointment_duration_check
      check (appointment_duration_min between 10 and 240);
  end if;
end $$;

-- ─── 3. Upsert target for end-of-call reports ────────────────────────
-- PostgREST `on_conflict` needs a real unique constraint; a partial unique
-- index (from migration 002) is not accepted as an arbiter.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calls_vapi_call_id_unique') then
    alter table calls add constraint calls_vapi_call_id_unique unique (vapi_call_id);
  end if;
end $$;
drop index if exists idx_calls_vapi_call_id_unique;
drop index if exists idx_calls_vapi_id;

-- ─── 4. Deleting a business deletes its data (account deletion requests) ──
alter table faq_items drop constraint if exists faq_items_business_id_fkey;
alter table faq_items add constraint faq_items_business_id_fkey
  foreign key (business_id) references businesses(id) on delete cascade;

alter table calls drop constraint if exists calls_business_id_fkey;
alter table calls add constraint calls_business_id_fkey
  foreign key (business_id) references businesses(id) on delete cascade;

alter table appointments drop constraint if exists appointments_business_id_fkey;
alter table appointments add constraint appointments_business_id_fkey
  foreign key (business_id) references businesses(id) on delete cascade;
alter table appointments drop constraint if exists appointments_call_id_fkey;
alter table appointments add constraint appointments_call_id_fkey
  foreign key (call_id) references calls(id) on delete set null;

alter table messages drop constraint if exists messages_business_id_fkey;
alter table messages add constraint messages_business_id_fkey
  foreign key (business_id) references businesses(id) on delete cascade;
alter table messages drop constraint if exists messages_call_id_fkey;
alter table messages add constraint messages_call_id_fkey
  foreign key (call_id) references calls(id) on delete set null;

-- ─── 5. Indexes matching the dashboard's query shapes ────────────────
create index if not exists idx_calls_business_created on calls(business_id, created_at desc);
create index if not exists idx_calls_follow_up on calls(business_id) where follow_up_required;
create index if not exists idx_messages_business_created on messages(business_id, created_at desc);
create index if not exists idx_appointments_business_start on appointments(business_id, start_time desc);

commit;
