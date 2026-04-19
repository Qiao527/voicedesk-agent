# Current Status

Last updated: April 16, 2026 (audit round complete)

## What Exists

- A server-side MVP path for inbound calls:
  - Vapi webhook endpoint
  - per-business assistant configuration
  - tool handlers for availability, booking, messages, and transfer intent
  - post-call logging into Supabase
  - owner SMS notification path
- A dashboard MVP:
  - Supabase-auth shell
  - call log page
  - settings page
  - analytics page
- A business onboarding CLI in `server/src/scripts/setup-business.ts`
- Environment examples for server and dashboard
- Google Calendar OAuth start/callback routes with per-business token persistence in the `businesses` table
- A dashboard settings entry point for connecting Google Calendar

## What Has Been Verified Locally

- `cd server && npm run build` passes
- `cd dashboard && npm run build` passes

This confirms the repo builds locally, but it does not confirm live end-to-end behavior with external services.

## Known Gaps

- Google Calendar OAuth wiring is now in place, but it still needs a real credential-backed dry run to confirm booking works end to end
- Dashboard data routes are scoped via `requireAuth` + `req.auth.businessId`; the Google OAuth start route is now authenticated and its `state` parameter is HMAC-signed, so the "connect any business" bypass is closed
- `transfer_to_human` uses Vapi's built-in `transferCall` (a real live forward, not just spoken language); destinations are normalized to E.164, the tool and system prompt are gated on availability, and Vapi's actual transfer end reasons feed the "transferred" outcome. Still needs a live dry run against real Vapi + Twilio to confirm end-to-end.
- Dashboard API write-paths are Zod-validated: `PATCH /business`, `POST /faqs`, and every `:id` path param. Validation errors return a readable 400 and surface in the Settings toast.
- Vapi webhook signature verification now hashes the exact raw request bytes captured by `express.json({ verify })`, so enabling `VAPI_WEBHOOK_SECRET` in production no longer 401s legitimate webhooks
- `check_availability` now respects each business's stored `business_hours` (open/close per weekday) and returns "closed today" instead of advertising 9–5 slots universally
- Booking is idempotent in both layers: unique index `(_vapi_call_id, start_time)` on `appointments` and a pre-insert lookup in the handler; call-log insert is now an upsert keyed by `vapi_call_id` so Vapi retries don't 409
- Call recording disclosure is configurable per business and is spoken before the greeting (two-party-consent states covered by default); owners can edit it in Settings
- RLS is enabled on all five tables with owner-scoped policies (defense in depth; server keeps using service_role)
- Call cost in cents is persisted from the Vapi `cost` field on end-of-call-report
- Phone numbers are masked in server logs (last-4 only) to reduce PII footprint
- `/health` now actually pings Supabase, so uptime monitors catch a broken service_role key
- Analytics appointment count excludes `status='cancelled'`
- Outcome/sentiment tracking on calls is still partially populated; sentiment in particular is not derived anywhere yet

## Practical Maturity

The repo is past brainstorming and past pure scaffolding. It is best described as an MVP prototype with real core paths implemented, but still needing integration hardening before first-customer trust.

## Working Assumption

Treat this repo as a managed-service MVP:

- optimize for getting one real business live safely
- avoid premature platformization
- keep docs honest about what is implemented versus planned
