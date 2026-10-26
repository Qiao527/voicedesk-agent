import { z } from "zod";
import { buildAvailableSlots, pickSpokenSlots } from "../../domain/scheduling";
import {
  businessDayWindow,
  formatTime,
  isValidDateString,
  localDateKey,
  resolveDayHours,
} from "../../domain/time";
import { CalendarUnavailableError } from "../../services/calendar";
import type { ToolContext } from "../context";
import type { ToolResult } from "../tools";

const Args = z.object({ date: z.string().trim() });

export const MAX_BOOKING_HORIZON_DAYS = 90;
const SCHEDULING_UNAVAILABLE =
  "Live scheduling is not available right now. Apologize and offer to take a message so the team can call back to book.";

/** Next few open weekdays after `fromDate`, for a helpful "we're closed" reply. */
function nextOpenDays(ctx: ToolContext, fromDate: string, count = 2): string[] {
  // Calendar-date arithmetic only, so UTC is correct here regardless of zone.
  const [y, m, d] = fromDate.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= 14 && out.length < count; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i, 12));
    const key = date.toISOString().slice(0, 10);
    if (resolveDayHours(key, ctx.business!.business_hours)) {
      out.push(
        `${date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })} (${key})`,
      );
    }
  }
  return out;
}

export async function checkAvailability(raw: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success || !isValidDateString(parsed.data.date)) {
    return { result: "I need the date as YYYY-MM-DD. Ask the caller which day they would like." };
  }
  const { date } = parsed.data;
  const { business, deps } = ctx;

  if (!business) return { result: SCHEDULING_UNAVAILABLE };
  if (!deps.calendar) return { result: SCHEDULING_UNAVAILABLE };

  const now = deps.now();
  const tz = business.timezone;
  const today = localDateKey(now, tz);
  if (date < today) {
    return { result: `${date} is in the past. Today is ${today}. Ask the caller for a future date.` };
  }
  const horizon = localDateKey(new Date(now.getTime() + MAX_BOOKING_HORIZON_DAYS * 86_400_000), tz);
  if (date > horizon) {
    return {
      result: `Bookings open at most ${MAX_BOOKING_HORIZON_DAYS} days ahead. Ask for a date before ${horizon}.`,
    };
  }

  const hours = resolveDayHours(date, business.business_hours);
  if (!hours) {
    const alternatives = nextOpenDays(ctx, date);
    return {
      result: `The business is closed on ${date}.${alternatives.length ? ` Next open days: ${alternatives.join(", ")}.` : ""} Offer one of those instead.`,
    };
  }

  const window = businessDayWindow(date, hours, tz);
  let busy;
  try {
    busy = await deps.calendar.listBusy(business.id, business.calendar_id || "primary", window);
  } catch (err) {
    if (err instanceof CalendarUnavailableError) return { result: SCHEDULING_UNAVAILABLE };
    throw err;
  }

  const slots = buildAvailableSlots({
    window,
    busy,
    now,
    durationMinutes: business.appointment_duration_min || 30,
  });

  if (slots.length === 0) {
    return { result: `There are no open times on ${date}. Ask the caller to try another day.` };
  }

  const spoken = pickSpokenSlots(slots, 5).map((s) => formatTime(s.start, tz));
  const more =
    slots.length > spoken.length
      ? ` (${slots.length} open slots in total; other times are possible too)`
      : "";
  return {
    result: `Open times on ${date}: ${spoken.join(", ")}${more}. Offer two or three of these and ask which works best.`,
  };
}
