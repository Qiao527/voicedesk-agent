import type { Api } from "./api";
import { DEMO_BUSINESS, DEMO_FAQS, generateDemoData } from "./demo-data";
import { isWithinHours, localDateKey } from "./time";
import type { AnalyticsSummary, Call, CallOutcome, Sentiment } from "./types";

const OUTCOMES: CallOutcome[] = ["appointment_booked", "message_taken", "transferred", "faq_answered", "missed", "other"];
const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];
const RESOLVED = new Set<CallOutcome>(["appointment_booked", "faq_answered", "message_taken"]);

/** Mirrors server/src/domain/analytics.ts for the in-browser demo. */
export function summarize(calls: Call[], now: Date, days: number, tz: string, hours: Record<string, string> | null): AnalyticsSummary {
  const since = now.getTime() - days * 86_400_000;
  const inRange = calls.filter((c) => new Date(c.created_at).getTime() >= since);
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<CallOutcome, number>;
  const sentiment = Object.fromEntries(SENTIMENTS.map((s) => [s, 0])) as Record<Sentiment, number>;
  const daily = new Map<string, { calls: number; booked: number }>();
  for (let i = days - 1; i >= 0; i--) daily.set(localDateKey(new Date(now.getTime() - i * 86_400_000), tz), { calls: 0, booked: 0 });

  let duration = 0;
  let cost = 0;
  let afterHours = 0;
  let followUps = 0;
  for (const c of inRange) {
    const o = c.outcome ?? "other";
    outcomes[o]++;
    if (c.sentiment) sentiment[c.sentiment]++;
    duration += c.duration_seconds;
    cost += c.cost_cents ?? 0;
    if (c.follow_up_required) followUps++;
    if (!isWithinHours(new Date(c.created_at), hours, tz)) afterHours++;
    const bucket = daily.get(localDateKey(new Date(c.created_at), tz));
    if (bucket) {
      bucket.calls++;
      if (o === "appointment_booked") bucket.booked++;
    }
  }
  const answered = inRange.length - outcomes.missed;
  const resolved = inRange.filter((c) => RESOLVED.has(c.outcome ?? "other")).length;

  return {
    periodDays: days,
    totalCalls: inRange.length,
    answeredCalls: answered,
    avgDurationSeconds: inRange.length ? Math.round(duration / inRange.length) : 0,
    totalDurationSeconds: duration,
    totalCostCents: cost,
    afterHoursCalls: afterHours,
    followUpsOpen: followUps,
    appointmentsBooked: outcomes.appointment_booked,
    resolutionRate: answered ? Math.round((resolved / answered) * 1000) / 1000 : 0,
    unreadMessages: 0,
    outcomes,
    sentiment,
    daily: Array.from(daily, ([date, v]) => ({ date, ...v })),
  };
}

const delay = <T>(value: T, ms = 180): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

/** In-memory API used in demo mode. Mutations persist for the session. */
export function createDemoApi(now = new Date()): Api {
  const data = generateDemoData(now);
  let business = structuredClone(DEMO_BUSINESS);
  let faqs = structuredClone(DEMO_FAQS);

  return {
    getBusiness: () => delay(business),
    updateBusiness: async (patch) => {
      business = { ...business, ...patch };
      return delay(business);
    },
    getPromptPreview: async () =>
      delay({
        firstMessage: [business.recording_disclosure, business.greeting_message].filter(Boolean).join(" "),
        systemPrompt: [
          `Today is ${now.toLocaleDateString("en-US", { timeZone: business.timezone, weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Time zone: ${business.timezone}.`,
          `You are the receptionist for ${business.name}. You answer the phone warmly and efficiently, like an experienced front-desk professional.`,
          `Business: ${business.name}\nAddress: ${business.address}\nStandard appointment length: ${business.appointment_duration_min} minutes`,
          "Your job, in order of priority:\n1. Find out what the caller needs.\n2. Booking: ask for the preferred day, call check_availability, offer two or three of the returned times, confirm the caller's name, then call book_appointment.\n3. Questions: answer from the FAQ. If it is not covered, take a message.\n4. Messages: get their name, the message, and confirm the callback number.\n5. If the caller asks for a person, use the transferCall tool.",
          "What you must not do:\n- Do not give medical, legal, or financial advice.\n- Do not quote prices or policies unless they are in the FAQ below.\n- Do not invent availability.",
          `FAQ (answer only from this list):\n${faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")}`,
        ].join("\n\n"),
      }),

    listCalls: () => delay(data.calls),
    getCall: async (id) => {
      const call = data.calls.find((c) => c.id === id);
      if (!call) throw new Error("Call not found");
      return delay({
        ...call,
        appointments: data.appointments.filter((a) => a.call_id === id),
        messages: data.messages.filter((m) => m.call_id === id),
      });
    },
    setFollowUp: async (id, required) => {
      const call = data.calls.find((c) => c.id === id)!;
      call.follow_up_required = required;
      return delay(call, 120);
    },

    listMessages: () => delay(data.messages),
    setMessageRead: async (id, isRead) => {
      const msg = data.messages.find((m) => m.id === id);
      if (msg) msg.is_read = isRead;
      await delay(null, 80);
    },

    listAppointments: () => delay(data.appointments),

    listFaqs: () => delay(faqs),
    createFaq: async (input) => {
      const faq = {
        id: `faq-${Date.now()}`,
        question: input.question,
        answer: input.answer,
        category: input.category ?? null,
        sort_order: faqs.length,
      };
      faqs = [...faqs, faq];
      return delay(faq);
    },
    updateFaq: async (id, patch) => {
      faqs = faqs.map((f) => (f.id === id ? { ...f, ...patch } : f));
      return delay(faqs.find((f) => f.id === id)!);
    },
    deleteFaq: async (id) => {
      faqs = faqs.filter((f) => f.id !== id);
      await delay(null, 80);
    },

    getAnalytics: async (days = 30) =>
      delay({
        ...summarize(data.calls, now, days, business.timezone, business.business_hours as Record<string, string>),
        unreadMessages: data.messages.filter((m) => !m.is_read).length,
      }),

    startCalendarConnect: async () => {
      throw new Error("Google Calendar is not available in the demo.");
    },
    disconnectCalendar: async () => {
      business = { ...business, google_calendar_connected_at: null };
    },
  };
}
