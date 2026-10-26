# Contributing

Thanks for taking a look. Bug reports, fixes and focused features are welcome.

## Setup

```bash
nvm use            # Node 22
cd server && npm ci
cd ../dashboard && npm ci
```

You don't need any accounts to work on most of the code:

- `cd server && npm run demo:call` runs a full simulated call through the real webhook server.
- `cd dashboard && npm run dev:demo` runs the dashboard on sample data.

## Before opening a pull request

```bash
cd server    && npm run lint && npm run typecheck && npm test
cd dashboard && npm run lint && npm test && npm run build
```

CI runs the same checks on Node 22 and 24.

## Guidelines

- Keep pure logic in `server/src/domain/` and cover it with unit tests. Anything time-zone related needs a test across a DST boundary.
- New persistence goes through the `Repository` interface, implemented for both Supabase and memory.
- Webhook handlers must stay idempotent on the Vapi call id. Vapi retries.
- Tool results are spoken to callers through the model. Keep them short, single-line, and tell the model what to do next.
- Schema changes need a new numbered migration in `server/supabase/migrations/` and the matching change in `schema.sql`.
- Write commit messages in the imperative ("Add X", "Fix Y") with a short body explaining why.
