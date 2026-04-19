# VoiceDesk AI — Brainstorming & Implementation Plan

## 1. What are we building?

An AI phone receptionist service for small professional practices in the Boston area. When a customer calls a dental clinic, law office, or real estate agency, our AI answers the phone, handles common questions, books appointments, and notifies the business owner — all without human intervention.

We are NOT building:
- A generic chatbot or voice assistant
- A call center platform
- A SaaS product (yet)

We ARE building:
- A managed service where we set up and maintain AI phone agents for each client
- Each client gets a dedicated phone number (or we forward their existing number)
- Each client pays a flat monthly fee ($250-400)
- Our cost per client is ~$30-75/month in API fees

## 2. Who is the customer?

**Primary target: Small professional practices in Boston metro with 1-10 employees.**

Why this segment:
- They currently pay $150-1200/month for answering services or a part-time receptionist
- They lose revenue from missed calls (avg $126K/year for small businesses)
- They are NOT tech-savvy enough to set this up themselves
- Boston has thousands of them within a 30-minute drive

Specific verticals (in order of priority):

**Tier 1 — Easiest to sell:**
- Dental clinics (appointment-driven, high no-show cost, simple FAQ)
- Physical therapy / chiropractic offices (same pattern)
- Hair salons / med spas (appointment-heavy, after-hours calls)

**Tier 2 — Higher value, more complex:**
- Small law firms (intake screening, conflict checks, urgency assessment)
- Real estate agents (property inquiry routing, showing scheduling)
- Accounting firms (seasonal surge handling, document request routing)

**Tier 3 — Future expansion:**
- Contractors (plumbers, electricians — emergency dispatch)
- Veterinary clinics
- Property management companies

**Start with Tier 1.** The conversation flow is simple (book appointment / answer FAQ / transfer), the stakes are lower (a dental appointment, not a legal emergency), and the sales pitch is straightforward.

## 3. What does the AI actually do on a call?

### Core conversation flow:

```
Call comes in
    ↓
AI answers: "Hi, thanks for calling [Business Name], this is [AI Name].
             How can I help you today?"
    ↓
Caller states their need
    ↓
┌─────────────────────────────────────────────────────────┐
│ Intent Detection (Claude API decides which path)        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  "I want to book an appointment"                        │
│     → Check Google Calendar for availability            │
│     → Offer 2-3 time slots                              │
│     → Confirm booking                                   │
│     → Send confirmation SMS to caller                   │
│                                                         │
│  "What are your hours / location / prices?"             │
│     → Look up FAQ from business knowledge base          │
│     → Answer directly                                   │
│                                                         │
│  "I need to cancel/reschedule"                          │
│     → Look up existing appointment                      │
│     → Process change                                    │
│                                                         │
│  "I have an emergency / urgent issue"                   │
│     → Flag as urgent                                    │
│     → Transfer to owner's cell phone                    │
│     → If no answer, take detailed message               │
│                                                         │
│  "I want to speak to a person"                          │
│     → Transfer to owner/staff                           │
│     → If unavailable, take message                      │
│                                                         │
│  Anything else / unclear                                │
│     → Try to help from knowledge base                   │
│     → If can't help, take message politely              │
│                                                         │
└─────────────────────────────────────────────────────────┘
    ↓
Call ends
    ↓
Post-call actions:
  - Save call transcript + summary to database
  - Send SMS/email notification to business owner
  - If appointment booked, add to calendar
  - Log call duration and outcome for analytics
```

### What the AI must NOT do:
- Give medical/legal/financial advice
- Confirm pricing without explicit permission from the business
- Share other patients'/clients' information
- Argue with callers or refuse to transfer to a human
- Make promises the business can't keep

### Personality guidelines for the AI:
- Warm but professional — like a friendly, competent receptionist
- Concise — phone calls should be efficient, not chatty
- Proactive — offer the next step ("Would you like me to book that for you?")
- Honest — "I'm an AI assistant, would you prefer to speak with someone directly?"
- Graceful under confusion — if it doesn't understand, ask once, then offer to take a message

## 4. Technical architecture decisions

### Why Vapi (not building our own voice stack):
- Handles STT, TTS, telephony, WebRTC — we don't want to build any of this
- Sub-second latency for natural conversation
- Supports Claude as the LLM provider
- Phone number provisioning built in
- Cost: ~$0.05/min platform + provider costs = ~$0.15-0.25/min total
- Alternative considered: Retell AI (simpler but less customizable)

### Why Claude API (not OpenAI):
- Better at following complex system prompts
- Better at knowing when NOT to answer (safety)
- Tool use is more reliable
- We already know Anthropic's ecosystem

### Why Supabase (not Firebase):
- PostgreSQL = real SQL, easier to query analytics
- Row-level security built in (important when we have multiple clients)
- Free tier is generous (500MB, 50K monthly active users)
- Edge functions for serverless if needed later

### Why Google Calendar (not Calendly):
- Most small businesses already use Google Calendar
- Free API, no per-seat cost
- We can read AND write
- Alternative: Cal.com (open source, if client doesn't use Google)

### Tech stack summary:
- **Runtime:** Node.js 20+ with TypeScript
- **Server framework:** Express (simple, mature, well understood)
- **Database:** Supabase (PostgreSQL)
- **Voice platform:** Vapi
- **LLM:** Claude Sonnet via Anthropic API
- **Calendar:** Google Calendar API
- **Notifications:** Twilio (SMS) + Resend (email)
- **Dashboard frontend:** React + Vite + Tailwind CSS
- **Hosting:** Railway (server) + Vercel (dashboard)
- **Domain:** voicedesk.ai (or similar)

## 5. Data model

### Table: businesses
```
id              UUID (primary key)
name            TEXT ("Dr. Smith's Dental Office")
phone           TEXT (business phone number)
owner_name      TEXT
owner_phone     TEXT (for notifications)
owner_email     TEXT
address         TEXT
hours           JSONB ({"mon": "9:00-17:00", "tue": "9:00-17:00", ...})
timezone        TEXT ("America/New_York")
greeting        TEXT (custom greeting message)
system_prompt   TEXT (custom AI instructions)
vapi_assistant_id TEXT (Vapi assistant ID)
vapi_phone_id   TEXT (Vapi phone number ID)
calendar_id     TEXT (Google Calendar ID)
plan            TEXT ("starter" | "pro")
monthly_fee     INTEGER (in cents)
status          TEXT ("active" | "paused" | "churned")
created_at      TIMESTAMPTZ
```

### Table: faq_items
```
id              UUID
business_id     UUID (FK → businesses)
question        TEXT ("What are your hours?")
answer          TEXT ("We're open Monday through Friday, 9am to 5pm.")
category        TEXT ("hours" | "pricing" | "services" | "insurance" | "other")
created_at      TIMESTAMPTZ
```

### Table: calls
```
id              UUID
business_id     UUID (FK → businesses)
vapi_call_id    TEXT
caller_phone    TEXT
caller_name     TEXT (if provided)
started_at      TIMESTAMPTZ
ended_at        TIMESTAMPTZ
duration_sec    INTEGER
transcript      TEXT (full transcript)
summary         TEXT (AI-generated 2-3 sentence summary)
outcome         TEXT ("appointment_booked" | "faq_answered" | "transferred" |
                      "message_taken" | "missed" | "other")
sentiment       TEXT ("positive" | "neutral" | "negative")
cost_cents      INTEGER (Vapi + LLM cost for this call)
created_at      TIMESTAMPTZ
```

### Table: appointments
```
id              UUID
business_id     UUID (FK → businesses)
call_id         UUID (FK → calls, nullable)
caller_name     TEXT
caller_phone    TEXT
service_type    TEXT ("cleaning" | "consultation" | "general")
scheduled_at    TIMESTAMPTZ
duration_min    INTEGER (default 30)
google_event_id TEXT
status          TEXT ("confirmed" | "cancelled" | "completed" | "no_show")
notes           TEXT
created_at      TIMESTAMPTZ
```

## 6. Implementation plan — task breakdown

### Phase 1: Core voice agent (Day 1-3)

**Task 1.1: Project setup**
- Initialize Node.js project with TypeScript
- Set up ESLint + Prettier
- Create .env with all API keys
- Set up Supabase project and create tables
- Success: `npm run dev` starts the server on port 3000

**Task 1.2: Vapi webhook server**
- Create Express server with POST /webhook/vapi endpoint
- Parse Vapi webhook events (function-call, end-of-call-report, status-update)
- Implement request signature verification
- Add error handling and logging
- Success: Server receives and logs Vapi webhook events

**Task 1.3: Create first Vapi assistant**
- Write function to create Vapi assistant via API
- Configure: Claude as LLM, ElevenLabs voice, greeting message
- Define tools: check_availability, book_appointment, get_business_info, transfer_call
- Attach a Vapi phone number
- Success: Calling the number reaches the AI, AI responds with greeting

**Task 1.4: Implement tool handlers**
- get_business_info: Fetch FAQ items and business details from Supabase
- check_availability: Query Google Calendar for free slots
- book_appointment: Create Google Calendar event + save to appointments table
- transfer_call: Use Vapi transfer to forward to owner's phone
- Success: Full conversation flow works — caller can ask a question AND book an appointment

**Task 1.5: Post-call processing**
- On end-of-call-report: save transcript, duration, outcome to calls table
- Generate summary using Claude (separate API call, not during the call)
- Send SMS notification to business owner via Twilio
- Success: After each call, owner gets SMS with summary, call is in database

### Phase 2: Client onboarding flow (Day 4-5)

**Task 2.1: Business setup script**
- CLI script: input business name, hours, phone, FAQ items
- Creates Supabase record
- Creates Vapi assistant with custom system prompt
- Provisions or imports phone number
- Success: Can onboard a new client in <10 minutes

**Task 2.2: System prompt engineering**
- Write a master system prompt template with {business_name}, {hours}, {services} variables
- Include safety guardrails (no medical advice, no pricing without approval)
- Include personality guidelines
- Test with 20+ common call scenarios
- Success: AI handles edge cases gracefully (confused caller, angry caller, wrong number)

**Task 2.3: Knowledge base integration**
- Function to convert FAQ items into structured context for Claude
- Support for adding new FAQ items without redeploying
- Success: Updating FAQ in database immediately changes AI responses

### Phase 3: Dashboard (Day 6-8)

**Task 3.1: Dashboard setup**
- React + Vite + Tailwind project
- Authentication (Supabase Auth — email/password for business owners)
- Protected routes
- Success: Business owner can log in and see their dashboard

**Task 3.2: Call log page**
- List of all calls with: time, caller, duration, outcome badge, summary
- Click to expand → full transcript
- Filter by date range, outcome type
- Success: Owner can see all calls at a glance

**Task 3.3: Settings page**
- Edit business info (name, hours, address)
- Edit FAQ items (add/edit/delete)
- Edit greeting message
- Preview the AI's behavior
- Success: Owner can customize AI without contacting us

**Task 3.4: Analytics page**
- Cards: total calls today/week/month, avg duration, appointment conversion rate
- Chart: calls per day (last 30 days)
- Top 5 most common caller questions
- Success: Owner has basic visibility into call performance

### Phase 4: Polish & deploy (Day 9-10)

**Task 4.1: Error handling & monitoring**
- Fallback: if webhook fails, Vapi plays voicemail message
- Alert: if API costs exceed threshold, notify us
- Logging: structured logs for debugging
- Success: System handles failures gracefully

**Task 4.2: Deployment**
- Deploy server to Railway
- Deploy dashboard to Vercel
- Set up custom domain
- Configure environment variables in production
- SSL, CORS, rate limiting
- Success: Everything works in production, not just localhost

**Task 4.3: Demo preparation**
- Set up a demo business ("Boston Dental Demo")
- Record a sample call for sales pitch
- Prepare one-page sales sheet
- Success: Can demo the product to a potential client in 5 minutes

### Phase 5: First client (Day 11-14)

**Task 5.1: Client acquisition**
- Walk into 10 dental clinics / PT offices in Boston
- Pitch: "Your answering service costs $X/month. I can do the same for $250, and it works 24/7."
- Offer 2-week free trial
- Success: 1 paying client

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI says something wrong/harmful | Medium | High | Strict system prompt guardrails, auto-transfer on uncertainty, review transcripts weekly |
| Caller gets frustrated with AI | Medium | Medium | Always offer "press 0 for a person", make transfer instant |
| Vapi outage | Low | High | Fallback to voicemail, alert owner immediately |
| High API costs on chatty calls | Medium | Medium | Set max call duration (10 min), monitor cost per call |
| HIPAA concerns (dental/medical) | Medium | High | Don't store PHI in transcripts, add BAA with Vapi ($1000/mo — defer until needed) |
| Client churns after trial | High | Medium | Weekly check-in calls, show ROI data (calls answered, appointments booked) |
| Competitor undercuts pricing | Medium | Low | Compete on service quality and customization, not price |

## 8. Pricing model

### Starter plan — $250/month
- Up to 200 minutes of calls/month
- Business hours coverage (customizable)
- FAQ knowledge base (up to 30 items)
- Google Calendar integration
- SMS notifications
- Basic dashboard

### Pro plan — $400/month
- Up to 500 minutes of calls/month
- 24/7 coverage
- Unlimited FAQ items
- Calendar + CRM integration
- Call analytics + weekly report
- Priority support

### Unit economics (per client):
- Vapi + Claude + TTS cost: ~$0.20/min average
- 200 minutes/month = $40 cost
- $250 revenue - $40 cost = $210 gross profit (84% margin)
- Infrastructure (Railway + Supabase + Twilio): ~$15/month amortized
- Net margin per client: ~$195/month

### Break-even: 1 client covers infrastructure. 5 clients = ~$1000/month revenue.

## 9. Success criteria

### MVP is done when:
1. A real caller can dial a number, talk to the AI, and book an appointment
2. The business owner gets an SMS notification within 30 seconds of the call ending
3. The appointment appears in Google Calendar
4. The call transcript appears in the dashboard
5. The whole thing runs without us touching anything

### Product-market fit is achieved when:
1. 3+ clients paying for 2+ consecutive months
2. <10% churn rate
3. Average client handles 50+ calls/month through the system
4. At least 1 client came from referral

## 10. What we are NOT doing (scope boundaries)

- NOT building our own voice stack (use Vapi)
- NOT training custom models (use Claude API)
- NOT building a multi-tenant SaaS platform (simple per-client setup)
- NOT doing outbound calls (inbound only for MVP)
- NOT integrating with every calendar/CRM (Google Calendar only for MVP)
- NOT handling payments in the app (invoice clients manually)
- NOT building a mobile app (responsive web dashboard)
- NOT competing on price (competing on "it just works" + local service)
