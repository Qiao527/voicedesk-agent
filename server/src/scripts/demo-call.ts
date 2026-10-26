/**
 * Offline end-to-end demo. Boots the real Express app on a random port with an
 * in-memory database and calendar, then replays the webhooks Vapi sends
 * during a booking call. No accounts or API keys needed.
 *
 *   npm run demo:call
 *
 * Set ANTHROPIC_API_KEY to run post-call analysis with Claude instead of the
 * offline heuristic.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { DEMO_FAQS, DEMO_PHONE_NUMBER, demoBusiness } from "../demo/fixtures";
import { localDateKey, resolveDayHours } from "../domain/time";
import { silentLogger } from "../lib/logger";
import { createMemoryRepository } from "../repositories/memory-repository";
import { createMemoryCalendar } from "../services/calendar";
import { createClaudeAnalyzer, createHeuristicAnalyzer } from "../services/call-analyzer";
import type { Notifier } from "../services/notifier";
import { createOAuthStateSigner } from "../services/oauth-state";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

const step = (n: number, title: string) => console.log(`\n${c.bold(`${n}.`)} ${c.bold(title)}`);
const say = (who: "AI" | "Caller", text: string) =>
  console.log(`   ${who === "AI" ? c.cyan("AI    ") : c.magenta("Caller")} ${text}`);

async function main() {
  const business = demoBusiness();
  const { repo, state } = createMemoryRepository({ businesses: [business], faqs: DEMO_FAQS });
  const calendar = createMemoryCalendar();
  const sent: string[] = [];
  const pending: Promise<void>[] = [];

  const notifier: Notifier = {
    channels: { sms: true, email: false },
    async sendSms(_to, body) {
      sent.push(body);
      return true;
    },
    async sendEmail() {
      return false;
    },
  };

  const analyzer = process.env.ANTHROPIC_API_KEY
    ? createClaudeAnalyzer({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANALYSIS_MODEL ?? "claude-haiku-5-5",
        logger: silentLogger,
      })
    : createHeuristicAnalyzer();

  const app = createApp({
    allowedOrigins: [],
    trustProxy: 0,
    vapiWebhookSecret: "demo-secret",
    rateLimit: false,
    pipeline: {
      repo,
      calendar: calendar.provider,
      notifier,
      analyzer,
      logger: silentLogger,
      voice: { model: "claude-haiku-5-5", voiceProvider: "vapi", voiceId: "Clara" },
      dashboardUrl: "http://localhost:5173",
      now: () => new Date(),
      background: (_label, task) => {
        pending.push(task());
      },
    },
    api: {
      verifyToken: async () => null as never,
      calendarOAuth: null,
      oauthState: createOAuthStateSigner("demo"),
      dashboardUrl: "http://localhost:5173",
    },
  });

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const post = async (message: object) => {
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/vapi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vapi-Secret": "demo-secret" },
      body: JSON.stringify({ message }),
    });
    return res.json() as Promise<any>;
  };

  const call = {
    id: `demo-${Date.now()}`,
    phoneNumber: { number: DEMO_PHONE_NUMBER },
    customer: { number: "+16175550199" },
  };

  // Find the next weekday the practice is open.
  let date = "";
  for (let i = 1; i < 14 && !date; i++) {
    const key = localDateKey(new Date(Date.now() + i * 86_400_000), business.timezone);
    if (resolveDayHours(key, business.business_hours)) date = key;
  }

  console.log(c.bold(`\nVoiceDesk offline demo · ${business.name}`));
  console.log(c.dim(`   webhook server on :${port}, in-memory DB, analyzer: ${analyzer.name}`));

  step(1, "Call arrives → assistant-request");
  const { assistant } = await post({ type: "assistant-request", call });
  const tools = assistant.model.tools.map((t: any) => t.function?.name ?? t.type);
  console.log(
    c.dim(`   model ${assistant.model.model}, voice ${assistant.voice.voiceId}, tools: ${tools.join(", ")}`),
  );
  say("AI", assistant.firstMessage);
  say("Caller", "Hi, I'd like to book a cleaning. My name is Jordan Lee.");

  step(2, "Model calls check_availability");
  const avail = await post({
    type: "tool-calls",
    call,
    toolCallList: [
      { id: "t1", type: "function", function: { name: "check_availability", arguments: { date } } },
    ],
  });
  console.log(c.dim(`   → ${avail.results[0].result}`));
  const firstTime = /: ([^,]+(?:AM|PM))/.exec(avail.results[0].result)?.[1] ?? "10:00 AM";
  say("AI", `I have ${firstTime} or a few other times that day. Which works for you?`);
  say("Caller", `${firstTime} is perfect.`);

  step(3, "Model calls book_appointment");
  const [h, rest] = firstTime.split(":");
  const minute = rest.slice(0, 2);
  const hour24 = (Number(h) % 12) + (/PM/.test(rest) ? 12 : 0);
  const dateTime = `${date}T${String(hour24).padStart(2, "0")}:${minute}:00`;
  const booking = await post({
    type: "tool-calls",
    call,
    toolCallList: [
      {
        id: "t2",
        type: "function",
        function: {
          name: "book_appointment",
          arguments: JSON.stringify({ caller_name: "Jordan Lee", date_time: dateTime, reason: "Cleaning" }),
        },
      },
    ],
  });
  console.log(c.dim(`   → ${booking.results[0].result}`));
  say("AI", "You're all set. We'll see you then. Anything else?");
  say("Caller", "Do you take Delta Dental?");
  say("AI", "Yes, we're in network with Delta Dental. We'll verify your coverage before the visit.");
  say("Caller", "Great, thanks so much!");

  step(4, "Call ends → end-of-call-report");
  const transcript = [
    `AI: ${assistant.firstMessage}`,
    "Caller: Hi, I'd like to book a cleaning. My name is Jordan Lee.",
    `AI: I have ${firstTime} or a few other times that day. Which works for you?`,
    `Caller: ${firstTime} is perfect.`,
    "AI: You're all set. We'll see you then. Anything else?",
    "Caller: Do you take Delta Dental?",
    "AI: Yes, we're in network with Delta Dental. We'll verify your coverage before the visit.",
    "Caller: Great, thanks so much!",
  ].join("\n");
  await post({
    type: "end-of-call-report",
    call,
    endedReason: "customer-ended-call",
    durationSeconds: 94,
    cost: 0.21,
    artifact: { transcript },
  });
  await Promise.all(pending);

  // The same number rings back a week later. Capture the greeting before the
  // server shuts down; VoiceDesk recognizes the caller from the call and
  // appointment above — no memory service, just the existing tables.
  const { assistant: back } = await post({
    type: "assistant-request",
    call: { id: `demo-${Date.now()}-return`, phoneNumber: { number: DEMO_PHONE_NUMBER }, customer: call.customer },
  });

  server.close();

  const row = state.calls[0];
  step(5, "Stored call record");
  console.log(`   outcome    ${c.green(row.outcome ?? "")}`);
  console.log(`   sentiment  ${row.sentiment}`);
  console.log(`   caller     ${row.caller_name}`);
  console.log(`   summary    ${row.summary}`);
  console.log(`   follow-up  ${row.follow_up_required ? "yes" : "no"}`);
  console.log(
    `   calendar   ${calendar.events.length} event(s), appointment linked: ${state.appointments[0]?.call_id === row.id}`,
  );

  step(6, "SMS sent to the owner");
  for (const body of sent)
    console.log(
      body
        .split("\n")
        .map((l) => `   ${l}`)
        .join("\n"),
    );

  step(7, "Same caller rings back → recognized");
  say("AI", back.firstMessage);
  const memory = (back.model.messages[0].content as string)
    .split("\n\n")
    .find((block: string) => block.startsWith("Returning caller"));
  if (memory)
    console.log(
      c.dim(
        memory
          .split("\n")
          .map((l) => `   ${l}`)
          .join("\n"),
      ),
    );
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
