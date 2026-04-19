-- VoiceDesk AI — Database Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- This file is the single source of truth for the data model.

-- ─── businesses ──────────────────────────────────────────────────────
-- Each row is one paying client (dental clinic, salon, law firm, etc.)

create table businesses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,                    -- the business's actual phone number
  owner_user_id   uuid references auth.users(id),  -- the Supabase auth user that owns this business (for API auth)
  owner_name      text,
  owner_phone     text,                    -- for SMS notifications
  owner_email     text,                    -- for email notifications + login
  address         text,
  vapi_phone_number text unique,           -- the Vapi number callers dial
  vapi_assistant_id text,                  -- Vapi assistant resource ID
  vapi_phone_id   text,                    -- Vapi phone number resource ID
  calendar_id     text default 'primary',  -- Google Calendar ID
  google_calendar_tokens jsonb,            -- OAuth tokens for this business's Google Calendar connection
  google_calendar_connected_at timestamptz,
  timezone        text default 'America/New_York',
  business_hours  jsonb default '{"mon":"9:00-17:00","tue":"9:00-17:00","wed":"9:00-17:00","thu":"9:00-17:00","fri":"9:00-17:00"}',
  greeting_message text default 'Hello! Thanks for calling. How can I help you today?',
  -- Spoken to the caller before the greeting. Two-party-consent states
  -- (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA) require this disclosure by law.
  recording_disclosure text default 'This call may be recorded for quality and scheduling.',
  system_prompt_override text,             -- nullable, lets owner customize AI personality
  voice_provider  text default '11labs',
  voice_id        text default 'paula',
  plan            text default 'starter',  -- 'starter' | 'pro'
  monthly_fee     integer default 25000,   -- in cents ($250.00)
  status          text default 'active',   -- 'active' | 'paused' | 'churned'
  created_at      timestamptz default now()
);

-- ─── calls ───────────────────────────────────────────────────────────
-- Every call, whether answered by AI or missed.

create table calls (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id),
  vapi_call_id    text,
  caller_number   text,
  caller_name     text,                    -- if provided during the call
  direction       text default 'inbound',
  status          text default 'completed', -- 'completed' | 'missed' | 'failed'
  duration_seconds integer default 0,
  summary         text,                    -- Claude-generated one-liner
  transcript      text,
  recording_url   text,
  outcome         text,                    -- 'appointment_booked' | 'faq_answered' | 'transferred' | 'message_taken' | 'missed' | 'other'
  sentiment       text,                    -- 'positive' | 'neutral' | 'negative'
  cost_cents      integer,                 -- Vapi + LLM cost for this call
  ended_reason    text,                    -- 'caller-hangup' | 'assistant-ended' | etc.
  created_at      timestamptz default now()
);

-- ─── appointments ────────────────────────────────────────────────────
-- Linked to both a call and a Google Calendar event.

create table appointments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id),
  call_id         uuid references calls(id),
  caller_name     text,
  caller_phone    text,
  service_type    text,                    -- 'cleaning' | 'consultation' | 'general' | etc.
  start_time      timestamptz not null,
  end_time        timestamptz,
  duration_min    integer default 30,
  reason          text,                    -- free-text reason from the caller
  notes           text,
  google_event_id text,
  status          text default 'confirmed', -- 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  _vapi_call_id   text,                    -- temporary linking field, set during call, before call_id is known
  created_at      timestamptz default now()
);

-- ─── messages ────────────────────────────────────────────────────────
-- When a caller wants to leave a message instead of booking.

create table messages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id),
  call_id         uuid references calls(id),
  caller_name     text,
  caller_phone    text,
  content         text not null,
  urgency         text default 'medium',   -- 'low' | 'medium' | 'high'
  is_read         boolean default false,
  _vapi_call_id   text,                    -- temporary linking field, set during call, before call_id is known
  created_at      timestamptz default now()
);

-- ─── faq_items ───────────────────────────────────────────────────────
-- Business-specific Q&A. Injected into the system prompt.

create table faq_items (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id),
  question        text not null,
  answer          text not null,
  category        text default 'other',    -- 'hours' | 'pricing' | 'services' | 'insurance' | 'location' | 'other'
  sort_order      integer default 0,
  created_at      timestamptz default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────

create index idx_businesses_vapi_number on businesses(vapi_phone_number);
create index idx_businesses_status on businesses(status);
create index idx_businesses_owner_user on businesses(owner_user_id);
create index idx_calls_business on calls(business_id);
create index idx_calls_vapi_id on calls(vapi_call_id);
-- Idempotency guard: Vapi retries end-of-call webhooks, so the same vapi_call_id
-- must never produce two rows.
create unique index idx_calls_vapi_call_id_unique on calls(vapi_call_id)
  where vapi_call_id is not null;
create index idx_calls_created on calls(created_at);
create index idx_appointments_business on appointments(business_id);
create index idx_appointments_vapi_call on appointments(_vapi_call_id);
-- Idempotency guard: retried tool-calls must not double-book. A single call
-- can still book multiple appointments at different start_times.
create unique index idx_appointments_call_start_unique
  on appointments(_vapi_call_id, start_time)
  where _vapi_call_id is not null;
create index idx_appointments_start on appointments(start_time);
create index idx_messages_business on messages(business_id);
create index idx_messages_unread on messages(business_id, is_read) where is_read = false;
create index idx_messages_vapi_call on messages(_vapi_call_id);
create index idx_faq_items_business on faq_items(business_id);

-- ─── Row-Level Security ──────────────────────────────────────────────
-- The Express server uses the service_role key (bypasses RLS). These policies
-- are defense in depth for any code path that uses the anon/authenticated
-- role to query tables directly from the browser.

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
