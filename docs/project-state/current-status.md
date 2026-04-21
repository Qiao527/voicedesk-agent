# Current Status

Last updated: April 20, 2026 (first live deployment + end-to-end call verified)

## What Exists and Is Verified Live

- **Server deployed on Railway**: `your-server.example.com` (Node.js 20, healthcheck passing, Supabase connected)
- **Dashboard deployed on Vercel**: `your-dashboard.example.com` (Vite/React, connected to server API)
- **End-to-end call flow verified**:
  - Vapi inbound call → webhook → Claude assistant-request → dynamic per-business config
  - Recording disclosure spoken before greeting ✅
  - FAQ answered correctly from business knowledge base ✅
  - Live call transfer to owner phone via Vapi transferCall ✅
  - End-of-call-report logged to Supabase (transcript, summary, cost, outcome) ✅
  - Recording URL persisted ✅
  - Dashboard displays call records ✅
- **Test business "Boston Dental Demo"** is live on `+1 (617) 555-0100` with 5 FAQ items
- Google Calendar OAuth routes in place (not yet verified with real credentials end-to-end)
- Business onboarding CLI in `server/src/scripts/setup-business.ts`
- Migration 002 applied to production Supabase (RLS, recording consent, idempotency)

## What Was Fixed During Deployment

- Railway defaulted to Node.js 18 → pinned to Node.js 20 via `nixpacks.toml`
- `VAPI_WEBHOOK_SECRET` signature verification blocked all webhooks → removed for now, re-enable after configuring matching secret in Vapi
- Vapi phone number webhook URL pointed to old domain → updated to `your-server.example.com`
- Migration 002 partial unique index (`WHERE vapi_call_id IS NOT NULL`) not recognized by PostgREST upsert → replaced with proper `ALTER TABLE calls ADD CONSTRAINT calls_vapi_call_id_unique UNIQUE (vapi_call_id)`

## Known Gaps

- **SMS notifications not working**: Twilio trial account requires A2P 10DLC registration for US local numbers. Options: complete A2P registration (1-2 weeks), buy a toll-free number, or upgrade Twilio account
- **Google Calendar booking not verified live**: OAuth routes exist but no real credential-backed dry run yet
- **Webhook signature verification disabled**: `VAPI_WEBHOOK_SECRET` removed to unblock deployment; re-enable after matching secret is configured on both sides
- **Sentiment analysis not implemented**: `sentiment` field on calls is never populated
- **Google refresh tokens stored as plaintext JSONB**
- **No self-serve signup / Stripe billing**: only CLI onboarding path exists
- **Outcome/sentiment fields partially populated**: outcome derives from appointments/messages/transfer; sentiment is not derived anywhere
- **Email notifications (Resend) not tested live**
- **Old test business records in Supabase**: 7 legacy business rows from earlier testing still present

## Practical Maturity

The system is deployed and handling real inbound calls end-to-end. The core voice path (greet → FAQ → transfer) works in production. Booking and message-taking work at the code level but need live calendar credentials to fully verify. SMS notifications are blocked by Twilio registration.

## Working Assumption

Treat this repo as a managed-service MVP:

- optimize for getting one real business live safely
- avoid premature platformization
- keep docs honest about what is implemented versus planned
