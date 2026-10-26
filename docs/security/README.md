# Security

## Audit, October 2026 (run 1)

VoiceDesk was put through a structured, multi-phase security audit: reconnaissance and a deterministic coverage ledger, coverage-led hunting across the webhook, dashboard-API, database and CI boundaries, and independent verification of every candidate by a reviewer that did not find it. Each confirmed issue was reproduced with a bounded local check in a no-network sandbox (the real Express app and `supabase-js` driving a WebAssembly Postgres, Google and the providers stubbed in-process) — no deployed service was ever touched.

The methodology follows the open-source [`cloudflare/security-audit-skill`](https://github.com/cloudflare/security-audit-skill): confirm only established boundary failures, keep deployment-dependent leads as "needs validation" with an exact unresolved fact, and set severity by demonstrated impact rather than checklist deviation.

### Result

| Verdict | Count | Items |
| --- | --- | --- |
| Confirmed | 2 | First-login business claim matched the email as an ILIKE pattern (medium); Google OAuth callback not bound to the completing session (low) |
| Needs validation | 3 | Webhook auth fail-open on a missing secret outside `production`; email claim trusting an unversioned Supabase confirmation setting; owner UPDATE RLS policy without column limits |
| Rejected | 0 | — |

All five were fixed at the source level in the same release (`v1.1`), including the three "needs validation" leads, because each fix removes the dependency on the unverifiable deployment fact. Every fix ships with a regression test.

### Reports

- [`audit-run-1-report.md`](audit-run-1-report.md) — run facts, posture, findings table, hardening notes, coverage summary.
- [`audit-run-1-findings-detail.md`](audit-run-1-findings-detail.md) — full source trace, reproduction and fix for each confirmed finding.
- [`audit-run-1-needs-validation.md`](audit-run-1-needs-validation.md) — the deployment-dependent leads with owner-observed checks.

### Fixes → findings

| Finding | Fix | Test |
| --- | --- | --- |
| F-1 ILIKE email claim | `domain/email.ts` literal matching + exact re-check + single-row claim (`supabase-repository.ts`) | `tests/unit/email.test.ts`, `tests/unit/auth-claim.test.ts` |
| F-2 OAuth session binding | Dashboard-mediated completion; authenticated `POST /auth/google/complete` bound to the owner (`http/routes/api.ts`) | `tests/integration/api.test.ts` |
| NV-1 Webhook fail-open | `loadEnv` requires the secret in every environment; explicit `ALLOW_UNAUTHENTICATED_WEBHOOKS` opt-out (`config/env.ts`) | `tests/unit/security.test.ts` |
| NV-2 Unverified-email claim | `verifyToken` returns `email_confirmed_at`; the claim refuses an unverified email | `tests/unit/auth-claim.test.ts` |
| NV-3 Unrestricted owner UPDATE | Migration 004 drops the owner UPDATE policies and revokes direct writes from `anon`/`authenticated` | validated against Postgres (PGlite) |

## Reporting a vulnerability

See [`../../SECURITY.md`](../../SECURITY.md).
