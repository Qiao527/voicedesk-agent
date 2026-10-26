# 4. Encrypting Google tokens at rest

**Status:** accepted (supersedes the April 2026 plaintext JSONB decision)

## Context

Each business connects its own Google Calendar. The refresh token grants long-lived write access to that calendar, and it was stored as plaintext JSONB in `businesses.google_calendar_tokens`. A leaked database backup or an over-broad SQL query would expose every client's calendar.

## Decision

- Seal tokens with AES-256-GCM before writing (`server/src/services/token-cipher.ts`). The envelope stores `iv`, `tag` and ciphertext as JSON, so the column type does not change.
- Bind the business id as associated data. A ciphertext copied onto another row fails authentication.
- The key comes from `TOKEN_ENCRYPTION_KEY` (32 bytes, base64 or hex). It is required in production whenever Google is configured.
- Rows written before encryption are still readable and get re-sealed on the next token refresh.
- Request the narrower `calendar.events` and `calendar.freebusy` scopes instead of full `calendar` access.

## Consequences

- A database leak alone no longer exposes calendar access.
- Rotating the key needs a re-encryption script. Not built yet; the envelope has a `v` field to support it.
- Losing the key means every business has to reconnect Google Calendar. The key belongs in the platform's secret store with a backup.
