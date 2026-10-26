/**
 * Pure slot math. The calendar provider supplies busy intervals; everything
 * here is deterministic so it can be tested without Google.
 */

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotOptions {
  /** Opening window for the day, as UTC instants. */
  window: Interval;
  /** Busy intervals from the calendar provider. */
  busy: Interval[];
  /** Current time. Slots that start before `now + minLeadMinutes` are dropped. */
  now: Date;
  /** Length of the appointment being offered. */
  durationMinutes: number;
  /** Grid step between candidate start times. Defaults to 30 minutes. */
  stepMinutes?: number;
  /** Minimum notice before an appointment can start. Defaults to 60 minutes. */
  minLeadMinutes?: number;
}

const MINUTE = 60_000;

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/** Candidate start times inside the window that don't collide with `busy`. */
export function buildAvailableSlots(options: SlotOptions): Interval[] {
  const { window, busy, now, durationMinutes } = options;
  const step = (options.stepMinutes ?? 30) * MINUTE;
  const duration = durationMinutes * MINUTE;
  const earliest = now.getTime() + (options.minLeadMinutes ?? 60) * MINUTE;

  const slots: Interval[] = [];
  for (let cursor = window.start.getTime(); cursor + duration <= window.end.getTime(); cursor += step) {
    if (cursor < earliest) continue;
    const slot = { start: new Date(cursor), end: new Date(cursor + duration) };
    if (!busy.some((b) => overlaps(slot, b))) slots.push(slot);
  }
  return slots;
}

/**
 * Spread a long list of slots into a short, speakable shortlist. Reading out
 * sixteen times over the phone is a bad experience; three to five well spread
 * options (morning, midday, afternoon) is what a human receptionist offers.
 */
export function pickSpokenSlots<T>(slots: T[], max = 5): T[] {
  if (slots.length <= max) return slots;
  const picked: T[] = [];
  const stride = (slots.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) picked.push(slots[Math.round(i * stride)]);
  return picked;
}

export type SlotCheck = { ok: true } | { ok: false; reason: "outside_hours" | "too_soon" | "conflict" };

/** Validate a specific requested slot before booking it. */
export function checkRequestedSlot(params: {
  slot: Interval;
  window: Interval | null;
  busy: Interval[];
  now: Date;
  minLeadMinutes?: number;
}): SlotCheck {
  const { slot, window, busy, now } = params;
  if (!window || slot.start < window.start || slot.end > window.end) {
    return { ok: false, reason: "outside_hours" };
  }
  if (slot.start.getTime() < now.getTime() + (params.minLeadMinutes ?? 60) * MINUTE) {
    return { ok: false, reason: "too_soon" };
  }
  if (busy.some((b) => overlaps(slot, b))) {
    return { ok: false, reason: "conflict" };
  }
  return { ok: true };
}
