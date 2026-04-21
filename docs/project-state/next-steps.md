# Next Steps

Last updated: April 20, 2026 (post first live deployment)

## Highest Priority (unblock first paying client)

1. **Fix SMS notifications** — either complete Twilio A2P 10DLC registration (1-2 weeks), buy a toll-free number ($2/mo, faster verification), or upgrade from trial account. Without SMS the owner misses call summaries.
2. **Verify Google Calendar booking end-to-end** — connect a real Google account via the dashboard Settings, then make a test call that books an appointment. Confirm the event appears in Google Calendar.
3. **Re-enable webhook signature verification** — generate a shared secret, set it as `VAPI_WEBHOOK_SECRET` in Railway and as the webhook secret in the Vapi dashboard. Verify with a test call.
4. **Clean up legacy test data** — remove the 7 old test business records from Supabase that aren't Boston Dental Demo.

## After That (product hardening)

1. Encrypt Google refresh tokens at rest (currently plaintext JSONB in `businesses` table).
2. Implement sentiment analysis — derive from transcript via Claude post-call, populate `sentiment` field.
3. Rate limiting on dashboard API + webhook endpoints.
4. Email notifications via Resend as SMS fallback.
5. Demo preparation — record a sample call, prepare one-page sales sheet for client pitches.

## Strategic Blockers (paid self-serve)

1. Self-serve signup + Stripe billing (currently only CLI onboarding).
2. Multi-business-per-user and multi-user-per-business (current model is 1:1 via `owner_user_id`).
3. HIPAA posture decision — recording and transcribing calls is a problem for clinics that need a BAA.
4. Public-facing privacy policy, ToS, DPA; data retention + deletion endpoint (GDPR/CCPA).

## Definition Of Useful Progress

A change should be considered meaningful if it does at least one of these:

- reduces risk in the live call path
- shortens first-client onboarding
- improves business scoping/auth safety
- makes the current project state easier to trust and understand
