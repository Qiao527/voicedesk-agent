# Product notes

## The problem

Small appointment-driven practices (dental offices, physical therapy, salons, small law firms) miss a large share of inbound calls. The front desk is busy with patients, the office is closed at 6pm, and most callers who reach voicemail don't leave a message. They call the next practice on the list.

The usual fixes are a human answering service ($150 to $1,200 a month, limited to taking messages) or another hire.

## What VoiceDesk does

An AI receptionist answers every call on the practice's number, around the clock:

- **Books appointments** into the practice's Google Calendar, using live free/busy and the practice's opening hours.
- **Answers questions** from an owner-maintained FAQ, and only from that FAQ.
- **Takes messages** with an urgency level. Urgent ones are texted to the owner immediately.
- **Transfers** to the owner's phone when the caller asks for a person.
- **Reports** after every call: an SMS and email digest, plus a dashboard with transcripts, outcomes and a follow-up queue.

## Who it's for first

Tier 1 is practices with simple call patterns (book, ask a question, leave a message) and a high cost per missed call: dental, PT/chiropractic, med spas. Tier 2 (law, real estate, accounting) needs intake screening and is out of scope until the core flow is proven.

## Guardrails

The receptionist must not give medical, legal or financial advice, quote prices or policies that aren't in the FAQ, share other customers' details, or invent availability. It confirms names, times and callback numbers before acting, and says it is an AI if asked. These rules are part of every system prompt, including owner-customized ones.

Recording disclosure is spoken before the greeting by default. Ten US states require all-party consent for call recording.

## Business model (managed service)

| Plan    | Price      | Includes                                              |
| ------- | ---------- | ----------------------------------------------------- |
| Starter | $250/month | 200 minutes, business-hours coverage, SMS digests      |
| Pro     | $400/month | 500 minutes, 24/7 coverage, analytics, priority setup |

Variable cost is roughly $0.15 to $0.25 per minute (telephony, speech, model). At 200 minutes that is about $40, leaving a gross margin above 80% before hosting.

## Explicitly out of scope

- Building a voice stack (Vapi handles telephony, STT and TTS)
- Outbound calling
- Calendars other than Google
- In-app billing and self-serve signup
- HIPAA workloads. Clinics that need a BAA need a different hosting and vendor setup.

## Success criteria

- A caller can book an appointment end to end and the owner gets the digest within a minute of hanging up.
- Three practices paying for two consecutive months with under 10% churn.
