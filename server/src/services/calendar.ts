import { google } from "googleapis";
import { z } from "zod";
import type { Interval } from "../domain/scheduling";
import type { Logger } from "../lib/logger";
import type { Repository } from "../repositories/repository";
import type { TokenCipher } from "./token-cipher";

/** Raised when a business can't use live scheduling (not configured / not connected). */
export class CalendarUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarUnavailableError";
  }
}

export interface CalendarEventInput {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
}

/** What the booking tools need from a calendar. Google is one implementation. */
export interface CalendarProvider {
  listBusy(businessId: string, calendarId: string, window: Interval): Promise<Interval[]>;
  createEvent(
    businessId: string,
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<{ id: string | null }>;
}

export interface CalendarOAuth {
  readonly configured: boolean;
  getAuthUrl(state: string): string;
  /** Exchange the OAuth code and persist (encrypted) tokens for the business. */
  connect(businessId: string, code: string): Promise<void>;
}

const StoredTokensSchema = z.object({
  access_token: z.string().nullish(),
  refresh_token: z.string().nullish(),
  scope: z.string().nullish(),
  token_type: z.string().nullish(),
  expiry_date: z.number().nullish(),
});
type StoredTokens = z.infer<typeof StoredTokensSchema>;

const SCOPES = [
  // freebusy + event insert on calendars the owner picks; narrower than full `calendar`.
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export function mergeTokens(existing: StoredTokens | null, incoming: StoredTokens): StoredTokens {
  // Google only returns a refresh_token on first consent; keep the old one.
  return {
    access_token: incoming.access_token ?? existing?.access_token ?? null,
    refresh_token: incoming.refresh_token ?? existing?.refresh_token ?? null,
    scope: incoming.scope ?? existing?.scope ?? null,
    token_type: incoming.token_type ?? existing?.token_type ?? null,
    expiry_date: incoming.expiry_date ?? existing?.expiry_date ?? null,
  };
}

export interface GoogleCalendarConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export function createGoogleCalendar(deps: {
  config: GoogleCalendarConfig;
  repo: Repository;
  cipher: TokenCipher;
  logger: Logger;
}): { provider: CalendarProvider; oauth: CalendarOAuth } {
  const { config, repo, cipher, logger } = deps;
  const configured = Boolean(config.clientId && config.clientSecret && config.redirectUri);

  function newClient() {
    if (!configured) {
      throw new CalendarUnavailableError("Google Calendar OAuth is not configured on the server.");
    }
    return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  }

  async function loadTokens(businessId: string): Promise<StoredTokens | null> {
    const stored = await repo.getCalendarTokens(businessId);
    if (!stored) return null;
    const parsed = StoredTokensSchema.safeParse(cipher.open(stored, businessId));
    return parsed.success ? parsed.data : null;
  }

  async function saveTokens(businessId: string, tokens: StoredTokens) {
    await repo.saveCalendarTokens(businessId, cipher.seal(tokens, businessId), new Date().toISOString());
  }

  async function authorizedCalendar(businessId: string) {
    const tokens = await loadTokens(businessId);
    if (!tokens?.refresh_token && !tokens?.access_token) {
      throw new CalendarUnavailableError("This business has not connected Google Calendar yet.");
    }
    const client = newClient();
    client.setCredentials({
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    });
    // Persist refreshed access tokens so we don't refresh on every call.
    client.on("tokens", (fresh) => {
      saveTokens(businessId, mergeTokens(tokens, StoredTokensSchema.parse(fresh))).catch((err) =>
        logger.warn("calendar.token_persist_failed", { businessId, error: String(err) }),
      );
    });
    return google.calendar({ version: "v3", auth: client });
  }

  const provider: CalendarProvider = {
    async listBusy(businessId, calendarId, window) {
      const calendar = await authorizedCalendar(businessId);
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: window.start.toISOString(),
          timeMax: window.end.toISOString(),
          items: [{ id: calendarId }],
        },
      });
      const busy = res.data.calendars?.[calendarId]?.busy ?? [];
      return busy
        .filter((b) => b.start && b.end)
        .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
    },

    async createEvent(businessId, calendarId, event) {
      const calendar = await authorizedCalendar(businessId);
      const res = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: event.summary,
          description: event.description,
          start: { dateTime: event.start.toISOString(), timeZone: event.timeZone },
          end: { dateTime: event.end.toISOString(), timeZone: event.timeZone },
          reminders: { useDefault: true },
        },
      });
      return { id: res.data.id ?? null };
    },
  };

  const oauth: CalendarOAuth = {
    configured,
    getAuthUrl(state) {
      return newClient().generateAuthUrl({
        access_type: "offline",
        include_granted_scopes: true,
        prompt: "consent",
        scope: SCOPES,
        state,
      });
    },
    async connect(businessId, code) {
      const { tokens } = await newClient().getToken(code);
      const existing = await loadTokens(businessId).catch(() => null);
      await saveTokens(businessId, mergeTokens(existing, StoredTokensSchema.parse(tokens)));
    },
  };

  return { provider, oauth };
}

/**
 * Calendar that lives in memory. Lets the offline call simulator and tests
 * exercise the full booking path without a Google account.
 */
export function createMemoryCalendar(initialBusy: Interval[] = []) {
  const events: Array<CalendarEventInput & { id: string; businessId: string }> = [];
  const provider: CalendarProvider = {
    async listBusy(_businessId, _calendarId, window) {
      return [...initialBusy, ...events]
        .filter((e) => e.start < window.end && e.end > window.start)
        .map((e) => ({ start: e.start, end: e.end }));
    },
    async createEvent(businessId, _calendarId, event) {
      const id = `evt_${events.length + 1}`;
      events.push({ ...event, id, businessId });
      return { id };
    },
  };
  return { provider, events };
}
