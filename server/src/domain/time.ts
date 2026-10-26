import { WEEKDAYS, type BusinessHours, type Weekday } from "./types";

/**
 * Time-zone helpers built on the Intl API only (no tz database dependency).
 *
 * Every booking decision runs through these functions, so they are written to
 * be pure and are covered by unit tests across DST transitions and
 * non-hour offsets (e.g. Asia/Kolkata, +05:30).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const HAS_OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

export interface ClockTime {
  hour: number;
  minute: number;
}

export interface DayHours {
  open: ClockTime;
  close: ClockTime;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidDateString(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Wall-clock components of `instant` as seen in `timeZone`. */
export function wallClockInZone(instant: Date, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC instant.
 *
 * Works by guessing, measuring the zone's offset at the guess, and
 * correcting. Two passes are enough to settle across a DST boundary. For a
 * time that does not exist (spring-forward gap) the result lands just after
 * the gap, which is the same behaviour most calendar apps use.
 */
export function zonedTimeToUtc(
  date: { year: number; month: number; day: number },
  time: ClockTime & { second?: number },
  timeZone: string,
): Date {
  const target = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second ?? 0);

  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const wall = wallClockInZone(new Date(candidate), timeZone);
    const observed = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    const diff = target - observed;
    if (diff === 0) break;
    candidate += diff;
  }
  return new Date(candidate);
}

/**
 * Parse a date-time string coming from the LLM.
 *
 * Strings with an explicit offset ("Z", "+02:00") are trusted as-is. Naive
 * strings ("2026-04-17T14:00:00") are interpreted in the business time zone,
 * which is what a caller means when they say "2pm".
 *
 * Returns `null` for anything unparseable so callers cannot accidentally book
 * at `Invalid Date`.
 */
export function parseDateTimeInZone(value: string, timeZone: string): Date | null {
  const trimmed = value.trim();

  if (HAS_OFFSET_RE.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const match = WALL_CLOCK_RE.exec(trimmed);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  if (!isValidDateString(`${y}-${mo}-${d}`)) return null;
  if (+h > 23 || +mi > 59 || +(s ?? 0) > 59) return null;

  return zonedTimeToUtc(
    { year: +y, month: +mo, day: +d },
    { hour: +h, minute: +mi, second: +(s ?? 0) },
    timeZone,
  );
}

/** "YYYY-MM-DD" for the calendar day `instant` falls on in `timeZone`. */
export function localDateKey(instant: Date, timeZone: string): string {
  const { year, month, day } = wallClockInZone(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Weekday of a calendar date. A calendar date's weekday is zone-independent. */
export function weekdayOf(dateStr: string): Weekday {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(jsDay + 6) % 7];
}

const HOURS_RE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

/** Parse "9:00-17:00". Returns null for "closed" or anything malformed. */
export function parseHoursRange(raw: string | undefined | null): DayHours | null {
  if (!raw) return null;
  const match = HOURS_RE.exec(raw.trim());
  if (!match) return null;
  const [oh, om, ch, cm] = match.slice(1).map(Number);
  if (oh > 23 || ch > 24 || om > 59 || cm > 59) return null;
  if (ch === 24 && cm !== 0) return null;
  if (ch * 60 + cm <= oh * 60 + om) return null;
  return { open: { hour: oh, minute: om }, close: { hour: ch, minute: cm } };
}

/**
 * Opening hours for a calendar date. Missing or malformed entries mean
 * closed: the receptionist must never advertise a day the owner marked off.
 */
export function resolveDayHours(
  dateStr: string,
  businessHours: BusinessHours | null | undefined,
): DayHours | null {
  if (!businessHours || !isValidDateString(dateStr)) return null;
  return parseHoursRange(businessHours[weekdayOf(dateStr)]);
}

/** UTC instants for the open and close times of `dateStr` in `timeZone`. */
export function businessDayWindow(
  dateStr: string,
  hours: DayHours,
  timeZone: string,
): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = zonedTimeToUtc({ year, month, day }, hours.open, timeZone);
  // "24:00" means midnight at the end of the day.
  const end =
    hours.close.hour === 24
      ? zonedTimeToUtc(nextDay({ year, month, day }), { hour: 0, minute: 0 }, timeZone)
      : zonedTimeToUtc({ year, month, day }, hours.close, timeZone);
  return { start, end };
}

function nextDay(d: { year: number; month: number; day: number }) {
  const next = new Date(Date.UTC(d.year, d.month - 1, d.day + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** True when `instant` falls inside the business's opening hours. */
export function isWithinBusinessHours(
  instant: Date,
  businessHours: BusinessHours | null | undefined,
  timeZone: string,
): boolean {
  const dateKey = localDateKey(instant, timeZone);
  const hours = resolveDayHours(dateKey, businessHours);
  if (!hours) return false;
  const { start, end } = businessDayWindow(dateKey, hours, timeZone);
  return instant >= start && instant < end;
}

export function formatTime(instant: Date, timeZone: string): string {
  return instant.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatLongDate(instant: Date, timeZone: string): string {
  return instant.toLocaleDateString("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatShortDateTime(instant: Date, timeZone: string): string {
  return instant.toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human-readable hours for the system prompt, e.g. "Mon 9:00-17:00; Sat closed". */
export function describeBusinessHours(businessHours: BusinessHours | null | undefined): string {
  const labels: Record<Weekday, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  return WEEKDAYS.map((day) => {
    const hours = parseHoursRange(businessHours?.[day]);
    return `${labels[day]} ${hours ? businessHours![day]!.replace(/\s+/g, "") : "closed"}`;
  }).join("; ");
}
