-- VoiceDesk AI database schema (fresh install).
--
-- New project: run this file once in the Supabase SQL editor.
-- Existing project: run the files in migrations/ in order instead; together
-- they produce exactly this schema.

-- ─── businesses ──────────────────────────────────────────────────────
-- One row per client business (dental clinic, salon, law office, ...).

create table businesses (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  phone                     text,                         -- the business's own public number
  owner_user_id             uuid references auth.users(id) on delete set null,
  owner_name                text,
  owner_phone               text,                         -- E.164; SMS alerts and live transfer target
  owner_email               text,                         -- email alerts; used to claim the business on first login
  address                   text,
  vapi_phone_number         text unique,                  -- the AI number callers dial
  vapi_assistant_id         text,                         -- unused with transient assistants; kept for static setups
  vapi_phone_id             text,
  calendar_id               text default 'primary',
  google_calendar_tokens    jsonb,                        -- AES-256-GCM envelope when TOKEN_ENCRYPTION_KEY is set
  google_calendar_connected_at timestamptz,
  timezone                  text not null default 'America/New_York',
  business_hours            jsonb default '{"mon":"9:00-17:00","tue":"9:00-17:00","wed":"9:00-17:00","thu":"9:00-17:00","fri":"9:00-17:00"}',
  greeting_message          text,
  -- Spoken before the greeting. Two-party-consent states
  -- (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA) require this disclosure.
  recording_disclosure      text default 'This call may be recorded for quality and scheduling.',
  system_prompt_override    text,
  appointment_duration_min  integer not null default 30
                              constraint businesses_appointment_duration_check check (appointment_duration_min between 10 and 240),
  voice_provider            text,                         -- reserved for per-business voice overrides
  voice_id                  text,
  plan                      text default 'starter',
  monthly_fee               integer default 25000,        -- cents
  status                    text not null default 'active', -- 'active' | 'paused' | 'churned'
  created_at                timestamptz not null default now()
);

-- ─── calls ───────────────────────────────────────────────────────────

create table calls (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid references businesses(id) on delete cascade,
  vapi_call_id        text constraint calls_vapi_call_id_unique unique,
  caller_number       text,
  caller_name         text,
  direction           text not null default 'inbound',
  status              text not null default 'completed',  -- 'completed' | 'missed'
  duration_seconds    integer not null default 0,
  summary             text,
  transcript          text,
  recording_url       text,
  outcome             text,      -- 'appointment_booked' | 'message_taken' | 'transferred' | 'faq_answered' | 'missed' | 'other'
  sentiment           text,      -- 'positive' | 'neutral' | 'negative'
  follow_up_required  boolean not null default false,
  analysis            jsonb,     -- structured post-call analysis (see CallAnalysis in src/domain/types.ts)
  cost_cents          integer,
  ended_reason        text,
  owner_notified_at   timestamptz,
  created_at          timestamptz not null default now()
);

-- ─── appointments ────────────────────────────────────────────────────

create table appointments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  call_id         uuid references calls(id) on delete set null,
  caller_name     text,
  caller_phone    text,
  service_type    text,
  start_time      timestamptz not null,
  end_time        timestamptz,
  duration_min    integer default 30,
  reason          text,
  notes           text,
  google_event_id text,
  status          text not null default 'confirmed', -- 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  _vapi_call_id   text,          -- set mid-call, before the calls row exists
  created_at      timestamptz not null default now()
);

-- ─── messages ────────────────────────────────────────────────────────

create table messages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  call_id         uuid references calls(id) on delete set null,
  caller_name     text,
  caller_phone    text,
  content         text not null,
  urgency         text not null default 'medium',    -- 'low' | 'medium' | 'high'
  is_read         boolean not null default false,
  _vapi_call_id   text,
  created_at      timestamptz not null default now()
);

-- ─── faq_items ───────────────────────────────────────────────────────

create table faq_items (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  question        text not null,
  answer          text not null,
  category        text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────

create index idx_businesses_vapi_number on businesses(vapi_phone_number);
create index idx_businesses_status on businesses(status);
create index idx_businesses_owner_user on businesses(owner_user_id);

create index idx_calls_business on calls(business_id);
create index idx_calls_created on calls(created_at);
create index idx_calls_business_created on calls(business_id, created_at desc);
create index idx_calls_follow_up on calls(business_id) where follow_up_required;

create index idx_appointments_business on appointments(business_id);
create index idx_appointments_start on appointments(start_time);
create index idx_appointments_business_start on appointments(business_id, start_time desc);
create index idx_appointments_vapi_call on appointments(_vapi_call_id);
-- Retried tool calls must not double-book; one call may still book several times.
create unique index idx_appointments_call_start_unique
  on appointments(_vapi_call_id, start_time)
  where _vapi_call_id is not null;

create index idx_messages_business on messages(business_id);
create index idx_messages_business_created on messages(business_id, created_at desc);
create index idx_messages_unread on messages(business_id, is_read) where is_read = false;
create index idx_messages_vapi_call on messages(_vapi_call_id);

create index idx_faq_items_business on faq_items(business_id);

-- ─── Row-level security ──────────────────────────────────────────────
-- The server uses the service-role key (bypasses RLS) and scopes every
-- query by business id itself. These policies are defense in depth for any
-- client that talks to Postgres directly with a user JWT.

alter table businesses    enable row level security;
alter table calls         enable row level security;
alter table messages      enable row level security;
alter table appointments  enable row level security;
alter table faq_items     enable row level security;

create policy "businesses_owner_select" on businesses for select
  using (auth.uid() = owner_user_id);
create policy "businesses_owner_update" on businesses for update
  using (auth.uid() = owner_user_id);

create policy "calls_owner_select" on calls for select
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "messages_owner_select" on messages for select
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));
create policy "messages_owner_update" on messages for update
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "appointments_owner_select" on appointments for select
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "faq_items_owner_all" on faq_items for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_user_id = auth.uid()));
