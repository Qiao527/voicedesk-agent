# Google Calendar Token Storage

Date: April 14, 2026

## Decision

Store Google Calendar OAuth tokens per business in `businesses.google_calendar_tokens` as JSONB, and track connection time in `businesses.google_calendar_connected_at`.

## Context

VoiceDesk is still a managed-service MVP, but appointment booking must eventually work per business, not through one hidden global Google account.

We needed the smallest implementation that:

- supports one business today
- scales to multiple businesses later
- avoids exposing tokens to the dashboard
- fits the current Supabase-without-ORM codebase

## Chosen Path

- Add `google_calendar_tokens jsonb` to `businesses`
- Add `google_calendar_connected_at timestamptz` to `businesses`
- Keep `calendar_id` as the target calendar selector, defaulting to `primary`
- Expose only `google_calendar_connected_at` to the dashboard, not the raw tokens
- Start OAuth from a server route and persist tokens in the callback using the `businessId` carried in `state`

## Consequences

- This is good enough for the current managed-service MVP
- Existing deployed databases will need a manual SQL migration
- API auth and business scoping still need to mature, but the token model no longer blocks that work
