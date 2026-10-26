# 5. Model choice for voice and analysis

**Status:** accepted, October 2026

## Context

The live conversation and the post-call analysis have different constraints.

- **Voice:** every turn adds model latency to the caller's wait. Long pauses make callers talk over the assistant or hang up. Tool use has to be reliable but the reasoning is shallow: pick a date, call a tool, read back a time.
- **Analysis:** runs once, after the call, off the critical path. It needs to follow a schema exactly and judge whether a human should follow up.

## Decision

- Voice: `claude-haiku-5-5` through Vapi's Anthropic integration (`VOICE_MODEL`), temperature 0.3. It is the fastest Claude model Vapi currently lists.
- Analysis: `claude-haiku-5-5` (`ANALYSIS_MODEL`) with structured outputs (`output_config.format` + a zod schema), so the result always parses.
- Both are configuration, not code. A practice with complex intake (for example a law office) can switch voice to `claude-sonnet-5` without a deploy.

## Consequences

- Average cost and latency per call stay low enough for the managed-service pricing in [product.md](../product.md).
- The analyzer receives server-known facts (appointments booked, transfer status) as ground truth, so a smaller model can't contradict what actually happened.
- When Vapi adds newer models, upgrading is an environment change plus a test call.
