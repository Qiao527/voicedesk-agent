# Changelog

## 1.0.0 (2026-10-25)

First public release.

### Calls
- Per-business assistants built on every call, with the date and opening hours in the prompt and guardrails that survive custom prompts.
- Booking checks opening hours, lead time and live Google free/busy before writing the event. Past and closed days are explained with alternatives.
- Urgent messages are texted to the owner during the call.
- Unknown numbers and database outages are answered by a message-taking fallback assistant.
- Retried webhooks never double-book, duplicate messages, or send a second SMS.

### Post-call
- Claude structured-output analysis: summary, sentiment, caller name, intent, topics, follow-up flag.
- Owner digest by SMS and HTML email, sent once per call.

### Dashboard
- New overview with resolution rate, after-hours calls, outcomes and a follow-up queue.
- Call detail drawer with chat-style transcript and the appointments and messages created on the call.
- Settings for opening hours, appointment length, greeting, knowledge base editing, system prompt preview, and calendar connection.
- Demo mode with realistic sample data; deployable to GitHub Pages.
- React 19, React Router 7, Vite 8, Tailwind 4, route-level code splitting.

### Security
- Webhook authentication via shared secret, bearer token or HMAC, required in production.
- AES-256-GCM encryption of Google tokens at rest; narrower OAuth scopes.
- Helmet, CORS allow-list, rate limiting, generic error responses, masked phone numbers in logs.

### Platform
- Express 5, zod 4, Anthropic SDK 1.x, Node 22.
- 105 server tests and 11 dashboard tests; CI on Node 22 and 24.
- Migration 003 and a corrected `schema.sql`.
- Dockerfile, Railway and Vercel configs.

### Fixed
- Weekday lookup for zones more than 12 hours ahead of UTC.
- Booking times for zones with half-hour offsets.
- SMS appointment times printed in server time instead of the business zone.
- `faq_answered` outcome never set, and mislabeled in the dashboard.
- Malformed tool arguments returned HTTP 500, which Vapi ignores.
- The upsert target for calls was a partial index, which PostgREST rejects.

## 0.1.0 (2026-04-20)

MVP deployed and verified with live test calls: inbound calls, FAQ answers, live transfer, call logging and a basic dashboard.
