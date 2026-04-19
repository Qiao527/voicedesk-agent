# VoiceDesk AI

AI-powered phone answering service for small businesses. An AI receptionist answers calls, takes messages, books appointments, and handles FAQs — all managed through a web dashboard.

## How It Works

```
Incoming call → Vapi (voice/telephony) → Express webhook server → Claude (AI brain)
                                              ↕                        ↕
                                        Supabase (DB)          Google Calendar
                                              ↕
                                   React Dashboard (business owner)
```

1. A customer calls the business phone number (powered by Vapi)
2. The AI receptionist greets them and figures out what they need
3. Depending on intent, it can:
   - **Book an appointment** on Google Calendar
   - **Answer questions** from the business's FAQ list
   - **Take a message** and notify the business owner via SMS/email
   - **Transfer the call** to a real person
4. After the call, a full log (transcript, summary, recording) is saved
5. The business owner reviews everything in the dashboard

## Tech Stack

| Layer         | Technology                    |
| ------------- | ----------------------------- |
| Backend       | Node.js, Express, TypeScript  |
| Database      | Supabase (PostgreSQL)         |
| Frontend      | React 18, Vite, TypeScript    |
| Voice         | Vapi API                      |
| AI            | Claude API (Anthropic)        |
| Calendar      | Google Calendar API           |
| Notifications | Twilio (SMS), Resend (Email)  |

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A [Supabase](https://supabase.com) project
- A [Vapi](https://vapi.ai) account
- An [Anthropic](https://console.anthropic.com) API key

### 1. Clone & install

```bash
git clone <repo-url> voicedesk-ai
cd voicedesk-ai

# Server
cd server
npm install
cp .env.example .env  # fill in your keys

# Dashboard
cd ../dashboard
npm install
cp .env.example .env
```

### 2. Set up Supabase

Copy the full schema SQL into the Supabase SQL Editor and run it:

```bash
# The schema file is the single source of truth for all tables + indexes
cat server/supabase/schema.sql
```

Tables created: `businesses`, `calls`, `appointments`, `messages`, `faq_items` — see `server/supabase/schema.sql` for the full DDL.

### 3. Configure Vapi

1. Create a Vapi account at [vapi.ai](https://vapi.ai)
2. Buy or port a phone number
3. Set the webhook URL to `https://your-server.com/webhooks/vapi`
4. The assistant config is returned dynamically via the `assistant-request` webhook

### 4. Run

```bash
# Terminal 1 — server
cd server
npm run dev

# Terminal 2 — dashboard
cd dashboard
npm run dev
```

- Server: http://localhost:3001
- Dashboard: http://localhost:5173
- Health check: http://localhost:3001/health

## Project Structure

```
voicedesk-ai/
├── server/
│   ├── src/
│   │   ├── index.ts                   # Express entry point
│   │   ├── routes/
│   │   │   ├── vapi-webhook.ts        # Vapi event handling
│   │   │   └── api.ts                 # Dashboard REST API
│   │   ├── services/
│   │   │   ├── supabase.ts            # Database client
│   │   │   ├── calendar.ts            # Google Calendar
│   │   │   └── notification.ts        # SMS & email alerts
│   │   └── config/
│   │       └── vapi-assistant.json    # Assistant definition
│   └── .env.example
├── dashboard/
│   ├── src/
│   │   ├── App.tsx                    # Router setup
│   │   ├── pages/
│   │   │   ├── CallLog.tsx            # Call history
│   │   │   ├── Settings.tsx           # FAQ & greeting config
│   │   │   └── Analytics.tsx          # Call metrics
│   │   └── components/
│   │       └── Layout.tsx             # Sidebar navigation
│   └── .env.example
└── README.md
```

## License

MIT
