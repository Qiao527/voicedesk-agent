# Next Steps

Last updated: April 16, 2026 (audit round complete)

## Highest Priority

1. Run one end-to-end dry run with real Google, Supabase, Vapi, and Twilio credentials using one seeded business and a real test call. Confirm: recording disclosure is spoken before the greeting, a live transfer forwards to the owner's phone, Vapi's `endedReason` maps to `transferred`, and the webhook signature check passes with `VAPI_WEBHOOK_SECRET` set.
2. Apply `server/supabase/migrations/002_idempotency_rls_consent.sql` to the production Supabase project and verify the existing `calls` / `appointments` tables survive the new unique indexes (fail fast on any pre-existing duplicates).
3. Decide on the path to external paid onboarding — the strategic blockers in "After That" are all prerequisites for a stranger being able to swipe a card and go live.

## After That (strategic blockers to paid self-serve)

1. Self-serve signup + Stripe billing (currently the setup CLI is the only path to create a business).
2. Multi-business-per-user and multi-user-per-business (current model is 1:1 via `owner_user_id`).
3. HIPAA posture decision — we already record and transcribe calls, which is a problem for any clinic that wants a BAA. Either avoid healthcare pre-BAA or negotiate BAAs with Vapi / Supabase / Deepgram / Anthropic / Twilio.
4. Public-facing privacy policy, ToS, and DPA; data retention policy + deletion endpoint (GDPR / CCPA).
5. Rate limiting and abuse controls on dashboard API + webhook.
6. Encrypt Google refresh tokens at rest (currently stored as plaintext JSONB; service_role has them in the clear).
7. Reconcile call outcome naming and analytics fields across schema, server, and dashboard; populate `sentiment`.
8. Onboarding runbooks + 10-minute first-client setup flow.

## Definition Of Useful Progress

A change should be considered meaningful if it does at least one of these:

- reduces risk in the live call path
- shortens first-client onboarding
- improves business scoping/auth safety
- makes the current project state easier to trust and understand
