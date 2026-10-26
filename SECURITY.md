# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's [private vulnerability reporting](https://github.com/Qiao527/voicedesk-ai/security/advisories/new) instead. Include the affected component, steps to reproduce, and the impact you expect.

You should get an acknowledgement within three business days.

## Scope

In scope: the server (`server/`), the dashboard (`dashboard/`), the SQL schema and migrations.

Out of scope: vulnerabilities in Vapi, Supabase, Google, Twilio or Resend themselves, and denial of service through call volume.

## How the system is protected

The controls at each trust boundary (webhook authentication, tenant scoping, OAuth state, token encryption, prompt-injection handling) are described in [docs/architecture.md](docs/architecture.md#security-model).

## Operator checklist

- Set `VAPI_WEBHOOK_SECRET` and configure the matching credential in Vapi.
- Set `TOKEN_ENCRYPTION_KEY` before connecting any Google Calendar, and back it up in your secret manager.
- Keep the Supabase `service_role` key on the server only. The dashboard uses the `anon` key.
- Restrict `DASHBOARD_URL` to your real dashboard origins.
- Call recordings and transcripts contain personal data. Set a retention policy in Vapi and in your database that matches your obligations.
