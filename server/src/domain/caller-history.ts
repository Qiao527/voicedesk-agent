import { normalizeE164, samePhone } from "./phone";
import type { AppointmentStatus, CallerHistory, CallerVisit, CallOutcome } from "./types";

/** The call columns `buildCallerHistory` reads. */
export interface CallerHistoryCall {
  caller_number: string | null;
  caller_name: string | null;
  outcome: CallOutcome | null;
  created_at: string;
}

/** The appointment columns `buildCallerHistory` reads. */
export interface CallerHistoryAppointment {
  caller_name: string | null;
  caller_phone: string | null;
  reason: string | null;
  start_time: string;
  status: AppointmentStatus;
}

/** Candidate match values for a `.in(...)` lookup: the raw and E.164 forms. */
export function phoneMatchCandidates(callerNumber: string): string[] {
  const trimmed = callerNumber.trim();
  return [...new Set([trimmed, normalizeE164(trimmed)].filter((v): v is string => Boolean(v)))];
}

/**
 * Assemble what we remember about a phone number from its calls and
 * appointments at a business. Rows may be a superset (the caller only needs to
 * have pre-filtered by business); this re-checks the number with `samePhone`
 * so near-matches from a coarse SQL filter are dropped. Returns `null` when the
 * number has no earlier calls or appointments.
 */
export function buildCallerHistory(
  callerNumber: string,
  calls: CallerHistoryCall[],
  appointments: CallerHistoryAppointment[],
  now: Date,
): CallerHistory | null {
  const normalized = normalizeE164(callerNumber) ?? callerNumber.trim();
  if (!normalized) return null;

  const myCalls = calls
    .filter((c) => samePhone(c.caller_number, callerNumber))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const myAppts = appointments
    .filter((a) => samePhone(a.caller_phone, callerNumber))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (myCalls.length === 0 && myAppts.length === 0) return null;

  const nowIso = now.toISOString();
  const upcoming = myAppts.find((a) => a.start_time >= nowIso && a.status === "confirmed") ?? null;
  const lastVisit = [...myAppts].reverse().find((a) => a.start_time < nowIso) ?? null;
  const lastCall = myCalls[0] ?? null;
  const name =
    myCalls.find((c) => c.caller_name)?.caller_name ??
    myAppts.find((a) => a.caller_name)?.caller_name ??
    null;

  const visit = (a: CallerHistoryAppointment): CallerVisit => ({
    start_time: a.start_time,
    reason: a.reason,
    status: a.status,
  });

  return {
    caller_number: normalized,
    caller_name: name,
    call_count: myCalls.length,
    last_call_at: lastCall?.created_at ?? null,
    last_outcome: lastCall?.outcome ?? null,
    upcoming_appointment: upcoming ? visit(upcoming) : null,
    last_visit: lastVisit ? visit(lastVisit) : null,
  };
}
