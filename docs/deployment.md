# Deployment

A production setup has four pieces: a Supabase project, the server (any Node 22 host; Railway config included), the dashboard (any static host; Vercel config included), and a Vapi phone number pointed at the server.

## 1. Supabase

1. Create a project.
2. In the SQL editor, run `server/supabase/schema.sql`. For an existing VoiceDesk database, run the files in `server/supabase/migrations/` in order instead.
3. Under **Authentication → URL configuration**, add the dashboard URL as the site URL and as a redirect URL.
4. Copy the project URL, the `anon` key (dashboard), and the `service_role` key (server only).

## 2. Server

Generate secrets:

```bash
openssl rand -hex 32      # VAPI_WEBHOOK_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32      # OAUTH_STATE_SECRET
```

Set the variables from [`server/.env.example`](../server/.env.example) on your host. Production refuses to start without `VAPI_WEBHOOK_SECRET`, and without `TOKEN_ENCRYPTION_KEY` when Google Calendar is enabled.

**Railway:** create a service from the repo with root directory `server`. `railway.toml` sets the build, the `/ping` health check and restart policy.

**Docker / Fly / Render / Cloud Run:**

```bash
cd server
docker build -t voicedesk-server .
docker run -p 3001:3001 --env-file .env voicedesk-server
```

Check `GET /health`. It reports database connectivity and which integrations are enabled, without exposing secrets.

## 3. Dashboard

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` (the server's public origin), then build:

```bash
cd dashboard
npm ci && npm run build   # output in dist/
```

**Vercel:** import the repo with root directory `dashboard`. `vercel.json` adds the SPA rewrite and immutable caching for hashed assets.

Add the dashboard origin to the server's `DASHBOARD_URL` (comma-separated if you have several). CORS rejects every other origin.

## 4. Vapi

1. Buy or import a number. `npm run setup` can buy one and create the business row in one step.
2. Set the number's **Server URL** to `https://<server>/webhooks/vapi`.
3. Add a credential so Vapi authenticates every request, using either:
   - **Bearer Token** credential with your `VAPI_WEBHOOK_SECRET`, or
   - **Bearer Token** with header name `X-Vapi-Secret` and the Bearer prefix off.
4. Leave the number without a saved assistant. The server returns one per call through `assistant-request`.

## 5. Google Calendar (optional)

Google redirects the browser back to the **dashboard**, which completes the
connection with the owner's logged-in session. This binds the grant to the
authenticated owner, so a link opened in another browser cannot attach a
calendar to someone else's business.

1. In Google Cloud, create an OAuth client (Web application) and enable the Google Calendar API.
2. Add `https://<dashboard>/settings` as an authorized redirect URI (dev: `http://localhost:5173/settings`).
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` (the same `https://<dashboard>/settings`) on the server.
4. The owner connects from **Settings → Integrations** in the dashboard.

## 6. Notifications (optional)

- **SMS:** set the Twilio variables. US long codes need A2P 10DLC registration before carriers deliver them; a toll-free number or a Messaging Service SID (`MG...`) is faster to get approved.
- **Email:** set `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` on a domain verified in Resend.

## 7. Onboard a business

```bash
cd server
npm run setup
```

The owner then signs up in the dashboard with the email used during setup. The first sign-in claims the business.

## Smoke test

1. `GET /health` returns `"db": "ok"`.
2. Call the number. You should hear the disclosure and greeting.
3. Ask for an appointment. It should appear in Google Calendar and in **Appointments**.
4. Hang up. The call shows in the dashboard within seconds, and the owner gets the digest.
