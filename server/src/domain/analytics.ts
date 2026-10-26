import { isWithinBusinessHours, localDateKey } from "./time";
import {
  CALL_OUTCOMES,
  SENTIMENTS,
  type BusinessHours,
  type CallOutcome,
  type CallRecord,
  type Sentiment,
} from "./types";

export type AnalyticsCall = Pick<
  CallRecord,
  "created_at" | "duration_seconds" | "outcome" | "sentiment" | "cost_cents" | "follow_up_required"
>;

export interface AnalyticsSummary {
  periodDays: number;
  totalCalls: number;
  answeredCalls: number;
  avgDurationSeconds: number;
  totalDurationSeconds: number;
  totalCostCents: number;
  afterHoursCalls: number;
  followUpsOpen: number;
  appointmentsBooked: number;
  /** Share of answered calls resolved without a human (booked, answered, or message taken). */
  resolutionRate: number;
  outcomes: Record<CallOutcome, number>;
  sentiment: Record<Sentiment, number>;
  daily: Array<{ date: string; calls: number; booked: number }>;
}

const RESOLVED: ReadonlySet<CallOutcome> = new Set(["appointment_booked", "faq_answered", "message_taken"]);

/**
 * Aggregate a window of calls for the dashboard overview.
 *
 * Days are bucketed in the business time zone. Bucketing by UTC would push a
 * 9pm Boston call into "tomorrow", which owners notice immediately.
 */
export function summarizeCalls(params: {
  calls: AnalyticsCall[];
  now: Date;
  periodDays: number;
  timeZone: string;
  businessHours: BusinessHours | null;
}): AnalyticsSummary {
  const { calls, now, periodDays, timeZone, businessHours } = params;

  const outcomes = Object.fromEntries(CALL_OUTCOMES.map((o) => [o, 0])) as Record<CallOutcome, number>;
  const sentiment = Object.fromEntries(SENTIMENTS.map((s) => [s, 0])) as Record<Sentiment, number>;

  const daily = new Map<string, { calls: number; booked: number }>();
  for (let i = periodDays - 1; i >= 0; i--) {
    const key = localDateKey(new Date(now.getTime() - i * 86_400_000), timeZone);
    daily.set(key, { calls: 0, booked: 0 });
  }

  let totalDuration = 0;
  let totalCost = 0;
  let afterHours = 0;
  let followUps = 0;

  for (const call of calls) {
    const outcome = call.outcome ?? "other";
    outcomes[outcome] += 1;
    if (call.sentiment) sentiment[call.sentiment] += 1;
    totalDuration += call.duration_seconds || 0;
    totalCost += call.cost_cents ?? 0;
    if (call.follow_up_required) followUps += 1;

    const created = new Date(call.created_at);
    if (!isWithinBusinessHours(created, businessHours, timeZone)) afterHours += 1;

    const bucket = daily.get(localDateKey(created, timeZone));
    if (bucket) {
      bucket.calls += 1;
      if (outcome === "appointment_booked") bucket.booked += 1;
    }
  }

  const answered = calls.length - outcomes.missed;
  const resolved = calls.filter((c) => RESOLVED.has(c.outcome ?? "other")).length;

  return {
    periodDays,
    totalCalls: calls.length,
    answeredCalls: answered,
    avgDurationSeconds: calls.length ? Math.round(totalDuration / calls.length) : 0,
    totalDurationSeconds: totalDuration,
    totalCostCents: totalCost,
    afterHoursCalls: afterHours,
    followUpsOpen: followUps,
    appointmentsBooked: outcomes.appointment_booked,
    resolutionRate: answered > 0 ? Math.round((resolved / answered) * 1000) / 1000 : 0,
    outcomes,
    sentiment,
    daily: Array.from(daily, ([date, v]) => ({ date, ...v })),
  };
}
