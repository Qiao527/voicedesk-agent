# 2. Webhook failure policy per message type

**Status:** accepted

## Context

Vapi treats each server message differently. `assistant-request` blocks the call from starting. `tool-calls` blocks the conversation, and Vapi ignores the body of any non-2xx response. `end-of-call-report` is retried on failure. A single "return 500 on error" policy is wrong for all three.

## Decision

| Message              | On failure                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| `assistant-request`  | Return the fallback assistant (message-taking only). Never 5xx.          |
| `tool-calls`         | Always HTTP 200. Each call gets `result` (expected outcome the model should talk through) or `error` (real failure). Strings are single-line, as Vapi requires. |
| `end-of-call-report` | Persist the call synchronously and return 500 if that fails so Vapi retries. Analysis and notifications run after the response. |

All three paths are idempotent on the Vapi call id:

- Appointments are unique on `(vapi_call_id, start_time)`; a retried booking returns the existing confirmation.
- Messages with identical content on the same call are stored once.
- Calls are upserted on `vapi_call_id`.
- The owner digest is sent only after an atomic `owner_notified_at IS NULL` claim.

## Consequences

- A ringing phone is always answered, even during an outage.
- The owner never gets two SMS for one call.
- Post-call work can be lost if the process dies between the response and the background task. The call row is already saved, so the loss is limited to the analysis and the digest. A durable queue would close this gap; it isn't justified at the current scale.
