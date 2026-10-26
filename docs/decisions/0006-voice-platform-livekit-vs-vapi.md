# 6. Voice platform: Vapi now, LiveKit as the scale/compliance exit

**Status:** accepted, October 2026

## Context

VoiceDesk runs its calls on [Vapi](https://vapi.ai): telephony, speech-to-text, the Anthropic model turn and text-to-speech, orchestrated for us. The recurring question is whether to move the voice layer to [LiveKit Agents](https://docs.livekit.io/agents/) — the open-source real-time framework — either on LiveKit Cloud or self-hosted.

The two are different kinds of thing. Vapi is a managed orchestration platform: you configure a prompt, tools and webhooks, and it owns the media pipeline. LiveKit Agents is an OSS framework (Python/Node) where you assemble the pipeline — STT, LLM, TTS, turn detection — and run it yourself on LiveKit Cloud or your own cluster. LiveKit Agents reached 1.0 in April 2025 and 1.5.x with native MCP tool support by 2026 ([Forasoft, 2026](https://www.forasoft.com/learn/livekit-for-ai-agents-guide); content rephrased for licensing compliance).

What matters for this product: it is multi-tenant for small appointment-driven practices (low per-tenant minutes early on), it books against live calendars and handles caller PHI, and every call must feel instant.

### How they compare

| Dimension | Vapi (current) | LiveKit Agents |
| --- | --- | --- |
| What you operate | a prompt, tools and webhooks | the whole agent pipeline and its infrastructure |
| Telephony | built in (Vapi numbers, Twilio, Vonage) | bring your own SIP trunk and wire it in |
| Cost, low volume (≲10k min/mo) | ≈ $0.08–0.13/min all-in, over a $0.05/min platform fee | similar or higher once engineering time is counted |
| Cost, at scale | $0.05/min platform fee plus provider pass-through, linear | self-assembled ≈ $0.06–0.15/min; undercuts managed 60–80% per call |
| Latency | tuned for you; sub-second out of the box | you own the latency budget, with every knob to hit <500 ms |
| Data / PHI | HIPAA is a paid add-on (~$2,000/mo) | self-hosting keeps audio and PHI inside your own infrastructure |
| Lock-in | orchestration **and** telephony are the vendor | OSS, no orchestration lock-in; you now own ops |
| Ops burden | near zero | Kubernetes/SFU scaling, autoscaling, monitoring are yours |

Figures are from vendor pricing and 2026 market write-ups ([Vapi pricing](https://vapi.ai/pricing), [getmacha](https://www.getmacha.com/blog/vapi-ai-pricing-explained), [cloudtalk](https://www.cloudtalk.io/blog/vapi-ai-pricing/), [Forasoft cost guide](https://www.forasoft.com/blog/article/livekit-ai-agents-guide), [trtc.io LiveKit pricing](https://trtc.io/blog/details/livekit-pricing-2026)); treat them as order-of-magnitude. The reported economic crossover sits around 10,000 minutes/month: below it the managed platform wins once you price engineering time, above it the framework path pulls clearly ahead.

## Decision

Stay on Vapi for the 1.x line. At VoiceDesk's current scale the managed platform is cheaper all-in once engineering and on-call time are counted, it ships telephony and a tuned low-latency pipeline we would otherwise have to build and operate, and it lets the project put its effort into the booking, analysis and dashboard logic that is actually the product.

Keep the switch cheap rather than pretend it will not happen. The architecture already quarantines the vendor:

- The voice platform only touches `server/src/vapi/` — the `assistant-request` builder and the webhook router (see [ADR 1](0001-transient-assistants.md) and [ADR 2](0002-webhook-failure-policy.md)).
- Scheduling, outcomes, analysis, notifications and persistence sit behind pure domain modules and the `Repository`/service interfaces ([ADR 3](0003-repository-and-di.md)). None of them import anything Vapi-specific.

So moving to LiveKit is re-implementing one edge module against a new transport, not a rewrite.

## Revisit when

Any one of these flips the calculation; two of them together should trigger a spike:

- **Volume.** Sustained traffic past ~10k agent-minutes/month, where the per-minute gap compounds into real money.
- **Compliance.** A serious push into PHI/HIPAA where keeping call audio inside our own infrastructure beats paying for a managed compliance add-on.
- **Control.** A feature that needs the raw media pipeline — custom turn-taking, barge-in tuning, a speech-to-speech model, on-device audio — that a managed platform does not expose.

## Migration sketch

Not prototyped in this repo on purpose: a LiveKit agent needs a SIP trunk and a running worker to be honest, and an unrunnable scaffold would be worse than none. The shape of the move, kept small by the design above:

- **Replace** `server/src/vapi/` with a LiveKit agent worker. Its entrypoint builds the same system prompt from the business and registers the same three tools, then delegates straight into today's handlers:

  ```python
  # illustrative — maps 1:1 onto the existing server
  async def entrypoint(ctx: JobContext):
      business = await repo.find_business_by_number(ctx.room.sip.trunk_number)
      agent = Agent(
          instructions=build_system_prompt(business, faqs),   # == vapi/assistant.ts
          tools=[check_availability, book_appointment, take_message],  # == vapi/handlers/*
      )
      session = AgentSession(stt=..., llm=..., tts=..., vad=...)   # the pipeline Vapi hides
      await session.start(agent=agent, room=ctx.room)
  ```

- **Keep** every domain module, the `Repository`, the calendar/analyzer/notifier services, the dashboard API and the dashboard untouched.
- **Add** the ops we currently outsource: SIP ingress, worker autoscaling, recording storage and health monitoring.

That boundary — one directory changes, the product's logic does not — is the reason staying on Vapi today carries no strategic debt.

## Sources

- Vapi pricing — https://vapi.ai/pricing
- Vapi per-minute cost breakdowns — https://www.getmacha.com/blog/vapi-ai-pricing-explained , https://www.cloudtalk.io/blog/vapi-ai-pricing/
- LiveKit Agents architecture and cost — https://www.forasoft.com/learn/livekit-for-ai-agents-guide , https://www.forasoft.com/blog/article/livekit-ai-agents-guide
- LiveKit Cloud pricing tiers — https://trtc.io/blog/details/livekit-pricing-2026 , https://livekit.io/pricing

<sub>Pricing and version facts were drawn from the sources above (checked October 2026) and rephrased here for licensing compliance; verify against current vendor pricing before acting on them.</sub>
