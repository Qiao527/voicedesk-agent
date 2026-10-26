import { WEEKDAYS, type BusinessHours } from "./types";

/** Calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function localDateKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function minutesInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

function weekdayOfKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

export function parseRange(raw: string | undefined): { open: number; close: number } | null {
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw?.trim() ?? "");
  if (!m) return null;
  const open = +m[1] * 60 + +m[2];
  const close = +m[3] * 60 + +m[4];
  return close > open && close <= 24 * 60 ? { open, close } : null;
}

export function isWithinHours(instant: Date, hours: BusinessHours | Record<string, string> | null, timeZone: string) {
  const range = parseRange((hours as Record<string, string> | null)?.[weekdayOfKey(localDateKey(instant, timeZone))]);
  if (!range) return false;
  const mins = minutesInZone(instant, timeZone);
  return mins >= range.open && mins < range.close;
}
