import { google, calendar_v3 } from "googleapis";
import { z } from "zod";
import { env } from "../config/env";
import { supabase } from "./supabase";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

const StoredGoogleCalendarTokensSchema = z.object({
  access_token: z.string().optional().nullable(),
  refresh_token: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  token_type: z.string().optional().nullable(),
  expiry_date: z.number().optional().nullable(),
});

export type StoredGoogleCalendarTokens = z.infer<
  typeof StoredGoogleCalendarTokensSchema
>;

export class CalendarIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarIntegrationError";
  }
}

function createOAuthClient(tokens?: StoredGoogleCalendarTokens) {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REDIRECT_URI
  ) {
    throw new CalendarIntegrationError(
      "Google Calendar OAuth is not configured in environment variables.",
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );

  if (tokens) {
    oauth2Client.setCredentials({
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    });
  }

  return oauth2Client;
}

function parseStoredGoogleCalendarTokens(
  value: unknown,
): StoredGoogleCalendarTokens | null {
  const parsed = StoredGoogleCalendarTokensSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function mergeStoredGoogleCalendarTokens(
  existing: unknown,
  incoming: StoredGoogleCalendarTokens,
): StoredGoogleCalendarTokens {
  const current = parseStoredGoogleCalendarTokens(existing) || {};

  return {
    access_token: incoming.access_token ?? current.access_token ?? null,
    refresh_token: incoming.refresh_token ?? current.refresh_token ?? null,
    scope: incoming.scope ?? current.scope ?? null,
    token_type: incoming.token_type ?? current.token_type ?? null,
    expiry_date: incoming.expiry_date ?? current.expiry_date ?? null,
  };
}

async function getBusinessCalendarContext(businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, calendar_id, google_calendar_tokens")
    .eq("id", businessId)
    .single();

  if (error || !data) {
    throw new CalendarIntegrationError("Business not found for calendar access.");
  }

  const tokens = parseStoredGoogleCalendarTokens(data.google_calendar_tokens);

  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new CalendarIntegrationError(
      `${data.name} has not connected Google Calendar yet.`,
    );
  }

  const oauth2Client = createOAuthClient(tokens);
  await oauth2Client.getAccessToken();

  return {
    calendar: google.calendar({ version: "v3", auth: oauth2Client }),
    calendarId: data.calendar_id || "primary",
  };
}

export function getAuthUrl(params: { state: string }): string {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [GOOGLE_CALENDAR_SCOPE],
    state: params.state,
  });
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<StoredGoogleCalendarTokens> {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  return StoredGoogleCalendarTokensSchema.parse({
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? null,
    expiry_date: tokens.expiry_date ?? null,
  });
}

export async function bookAppointment(params: {
  businessId: string;
  summary: string;
  description: string;
  startTime: string; // ISO 8601
  durationMinutes?: number;
  calendarId?: string;
}): Promise<calendar_v3.Schema$Event> {
  const {
    businessId,
    summary,
    description,
    startTime,
    durationMinutes = 30,
    calendarId,
  } = params;

  const { calendar, calendarId: storedCalendarId } =
    await getBusinessCalendarContext(businessId);

  const targetCalendarId = calendarId || storedCalendarId;
  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const res = await calendar.events.insert({
    calendarId: targetCalendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  return res.data;
}

/**
 * Convert a local clock time on a given date to a UTC Date, using the Intl
 * API so DST transitions are handled correctly.
 *
 * Accepts either an integer hour (9 → 09:00) or a "HH:MM" string.
 *
 * Example: localToUTC("2026-04-15", 9, "America/New_York") → 13:00 UTC (EDT)
 */
function localToUTC(
  dateStr: string,
  localTime: number | { hour: number; minute: number },
  timezone: string,
): Date {
  const hour = typeof localTime === "number" ? localTime : localTime.hour;
  const minute = typeof localTime === "number" ? 0 : localTime.minute;
  const naive = new Date(
    `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  const actualHour =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(naive),
      10,
    ) % 24;
  const offsetHours = hour - actualHour;
  return new Date(naive.getTime() + offsetHours * 60 * 60 * 1000);
}

/**
 * Resolve the open/close clock times for a given date based on the business's
 * stored business_hours JSON (e.g. `{"mon":"9:00-17:00","tue":"9:00-17:00"}`).
 * Returns null if the business is closed on that day.
 *
 * The key is the 3-letter lowercase day abbreviation (mon/tue/...). Missing
 * keys = closed. Invalid values also = closed (fail closed, never accidentally
 * advertise availability on a day the owner marked off).
 */
export function resolveDayHours(
  dateStr: string,
  businessHours: Record<string, string> | null | undefined,
  timezone: string,
): { open: { hour: number; minute: number }; close: { hour: number; minute: number } } | null {
  if (!businessHours) return null;

  // Determine the day-of-week for `dateStr` IN the business timezone, so a
  // business in Tokyo using a Friday closing doesn't see Thursday's schedule
  // because the server is in California.
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  })
    .format(noon)
    .toLowerCase()
    .slice(0, 3);

  const raw = businessHours[weekday];
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, oh, om, ch, cm] = match;
  const open = { hour: +oh, minute: +om };
  const close = { hour: +ch, minute: +cm };
  if (open.hour > 23 || close.hour > 23 || open.minute > 59 || close.minute > 59) {
    return null;
  }
  const openMins = open.hour * 60 + open.minute;
  const closeMins = close.hour * 60 + close.minute;
  if (closeMins <= openMins) return null;

  return { open, close };
}

/**
 * Parse an ISO-like date-time string and return a UTC Date.
 *
 * If the string has explicit timezone info (Z, +HH:MM, -HH:MM), trust it.
 * Otherwise interpret the wall-clock time in the given business timezone,
 * handling DST correctly.
 *
 * This guards against the AI passing back a naive ISO string like
 * "2026-04-17T14:00:00" and the server interpreting it as UTC (or server
 * local time), which would shift the appointment by hours.
 */
export function parseDateTimeInTimezone(
  dateTimeStr: string,
  timezone: string,
): Date {
  if (/Z|[+-]\d{2}:?\d{2}$/.test(dateTimeStr)) {
    return new Date(dateTimeStr);
  }

  const match = dateTimeStr.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) {
    // Fallback: let Date do its best. Caller should catch invalid dates.
    return new Date(dateTimeStr);
  }

  const [, y, mo, d, h, mi, s] = match;
  const target = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || "0"));

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Converge in at most 2 iterations: first pass estimates the UTC offset,
  // second pass corrects for DST transitions near the boundary.
  let candidate = new Date(target);
  for (let i = 0; i < 2; i++) {
    const parts = fmt.formatToParts(candidate);
    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
    const actual = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    const diff = target - actual;
    if (diff === 0) break;
    candidate = new Date(candidate.getTime() + diff);
  }

  return candidate;
}

export async function getAvailableSlots(params: {
  businessId: string;
  date: string;
  timezone: string;
  dayHours: {
    open: { hour: number; minute: number };
    close: { hour: number; minute: number };
  };
  calendarId?: string;
}): Promise<{ start: string; end: string }[]> {
  const { businessId, date, timezone, dayHours, calendarId } = params;
  const { calendar, calendarId: storedCalendarId } =
    await getBusinessCalendarContext(businessId);
  const targetCalendarId = calendarId || storedCalendarId;
  const dayStart = localToUTC(date, dayHours.open, timezone);
  const dayEnd = localToUTC(date, dayHours.close, timezone);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: targetCalendarId }],
    },
  });

  const busy = res.data.calendars?.[targetCalendarId]?.busy || [];

  // Build 30-minute slots between 9am–5pm, excluding busy periods
  const slots: { start: string; end: string }[] = [];
  let cursor = dayStart.getTime();
  const slotDuration = 30 * 60 * 1000;

  while (cursor + slotDuration <= dayEnd.getTime()) {
    const slotStart = cursor;
    const slotEnd = cursor + slotDuration;

    const isBusy = busy.some((b) => {
      const busyStart = new Date(b.start!).getTime();
      const busyEnd = new Date(b.end!).getTime();
      return slotStart < busyEnd && slotEnd > busyStart;
    });

    if (!isBusy) {
      slots.push({
        start: new Date(slotStart).toISOString(),
        end: new Date(slotEnd).toISOString(),
      });
    }

    cursor += slotDuration;
  }

  return slots;
}
