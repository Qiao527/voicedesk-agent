import { createApp } from "../../src/app";
import { DEMO_FAQS, demoBusiness } from "../../src/demo/fixtures";
import type { Interval } from "../../src/domain/scheduling";
import type { Business } from "../../src/domain/types";
import { silentLogger } from "../../src/lib/logger";
import { createMemoryRepository, type MemoryState } from "../../src/repositories/memory-repository";
import type { Repository } from "../../src/repositories/repository";
import { createMemoryCalendar, type CalendarOAuth } from "../../src/services/calendar";
import type { CallAnalyzer } from "../../src/services/call-analyzer";
import type { Notifier } from "../../src/services/notifier";
import { createOAuthStateSigner } from "../../src/services/oauth-state";

export const SECRET = "test-webhook-secret";
/** Tuesday 2026-10-20, 10:00 in Boston. */
export const NOW = new Date("2026-10-20T14:00:00.000Z");
export const OWNER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@harborview-dental.example.com",
};
export const TOKEN = "valid-token";

export interface TestAppOptions {
  businesses?: Business[];
  seed?: Partial<MemoryState>;
  busy?: Interval[];
  analyzer?: CallAnalyzer | null;
  calendar?: boolean;
  calendarOAuth?: CalendarOAuth | null;
  repoOverrides?: Partial<Repository>;
}

export function buildTestApp(options: TestAppOptions = {}) {
  const business = demoBusiness({ owner_user_id: OWNER.id });
  const { repo, state } = createMemoryRepository({
    businesses: options.businesses ?? [business],
    faqs: DEMO_FAQS,
    ...options.seed,
  });
  const finalRepo = { ...repo, ...options.repoOverrides } as Repository;
  const calendar = createMemoryCalendar(options.busy ?? []);
  const sms: Array<{ to: string; body: string }> = [];
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const pending: Promise<void>[] = [];

  const notifier: Notifier = {
    channels: { sms: true, email: true },
    async sendSms(to, body) {
      sms.push({ to, body });
      return true;
    },
    async sendEmail(email) {
      emails.push(email);
      return true;
    },
  };

  const oauthState = createOAuthStateSigner("state-secret");

  const app = createApp({
    allowedOrigins: ["http://localhost:5173"],
    trustProxy: 0,
    vapiWebhookSecret: SECRET,
    rateLimit: false,
    pipeline: {
      repo: finalRepo,
      calendar: options.calendar === false ? null : calendar.provider,
      notifier,
      analyzer: options.analyzer === undefined ? null : options.analyzer,
      logger: silentLogger,
      voice: { model: "claude-haiku-5-5", voiceProvider: "vapi", voiceId: "Clara" },
      dashboardUrl: "http://localhost:5173",
      now: () => NOW,
      background: (_label, task) => {
        pending.push(task());
      },
    },
    api: {
      verifyToken: async (token) =>
        token === TOKEN
          ? { ...OWNER, emailVerified: true }
          : token === "stranger"
            ? { id: "22222222-2222-4222-8222-222222222222", email: "stranger@example.com", emailVerified: true }
            : null,
      calendarOAuth: options.calendarOAuth ?? null,
      oauthState,
      dashboardUrl: "http://localhost:5173",
    },
  });

  return {
    app,
    repo: finalRepo,
    state,
    business,
    calendar,
    sms,
    emails,
    oauthState,
    /** Wait for background work (analysis, notifications) to finish. */
    flush: async () => {
      while (pending.length) await Promise.all(pending.splice(0));
    },
  };
}

export const call = (id = "call-1") => ({
  id,
  phoneNumber: { number: "+16175550100" },
  customer: { number: "+16175550199" },
});

export const toolCall = (name: string, args: unknown, id = "tc-1") => ({
  id,
  type: "function",
  function: { name, arguments: args },
});
