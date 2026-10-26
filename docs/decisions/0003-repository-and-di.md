# 3. Repository interface and dependency injection

**Status:** accepted

## Context

The original webhook route called Supabase, Google and Twilio directly from a 980-line file. It could only be tested by placing real phone calls.

## Decision

- All persistence goes through a `Repository` interface (`server/src/repositories/repository.ts`) with two implementations: Supabase for production and an in-memory version with the same unique-constraint semantics.
- Calendar, notifier and analyzer are interfaces too.
- `createApp(deps)` takes every implementation. `index.ts` is the only file that knows about concrete providers.
- Pure logic (time zones, slot math, outcomes, message rendering, analytics) lives in `domain/` with no I/O.

## Consequences

- The integration tests drive the real Express app with supertest: webhook auth, tool calls, retries, tenant isolation, OAuth callbacks.
- `npm run demo:call` replays a full booking call offline in about a second, which doubles as a smoke test in CI.
- Each Supabase query sits next to its business-id filter in one file, which makes tenant-scoping easy to review.
- The cost is one more layer. The interface mirrors the queries the app actually runs, not a generic CRUD abstraction.
