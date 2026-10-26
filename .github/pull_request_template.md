## Summary

<!-- What changes and why. Link the issue if there is one. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass in `server/`
- [ ] `npm run lint`, `npm test` and `npm run build` pass in `dashboard/`
- [ ] Webhook handlers stay idempotent on the Vapi call id
- [ ] Schema changes include a numbered migration and the matching `schema.sql` change
- [ ] Docs updated if behavior or configuration changed
