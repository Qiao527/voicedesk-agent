-- Migration: add _vapi_call_id to messages + owner_user_id to businesses for auth scoping.
-- Run this in the Supabase SQL Editor after updating the code.

-- 1. Link messages to the Vapi call that produced them (before call_id is known).
alter table messages
  add column if not exists _vapi_call_id text;

create index if not exists idx_messages_vapi_call on messages(_vapi_call_id);

-- 2. Link a business to the Supabase auth user that owns it.
--    This lets the API authorize requests per-tenant instead of returning the
--    first business to anyone authenticated.
alter table businesses
  add column if not exists owner_user_id uuid references auth.users(id);

create index if not exists idx_businesses_owner_user on businesses(owner_user_id);

-- 3. Backfill owner_user_id by matching owner_email to auth.users.email.
--    Safe to re-run; only fills rows that are currently null.
update businesses b
set owner_user_id = u.id
from auth.users u
where b.owner_user_id is null
  and b.owner_email is not null
  and lower(b.owner_email) = lower(u.email);
