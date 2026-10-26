# 1. Transient assistants instead of saved Vapi assistants

**Status:** accepted

## Context

Each business needs its own greeting, hours, FAQ, transfer number and today's date in the prompt. Vapi supports two models: a saved assistant per business that we keep in sync, or an `assistant-request` webhook that returns a full assistant definition for each incoming call.

## Decision

Use `assistant-request`. The server builds the assistant from the database on every call (`server/src/vapi/assistant.ts`).

## Consequences

- Settings changes in the dashboard apply to the next call. There is no sync job and no drift between our DB and Vapi.
- The prompt always contains the current date in the business time zone, which stops the model from guessing the year or weekday.
- The transfer tool is only attached when the owner's number is valid E.164, so the model can't promise a transfer it can't perform.
- Every call costs one extra round-trip (a DB read) before the greeting. In practice this is tens of milliseconds.
- The assistant must not carry its own `server.url`. Vapi only attaches the org webhook credential to server URLs configured on saved resources, so tool calls are routed through the phone number's server URL instead.
- If the DB is down, the router still answers with a fallback assistant that takes messages (see [ADR 2](0002-webhook-failure-policy.md)).
