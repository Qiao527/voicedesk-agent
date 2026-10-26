import { z } from "zod";
import { normalizeE164 } from "../../domain/phone";
import { checkRequestedSlot } from "../../domain/scheduling";
import { MAX_BOOKING_HORIZON_DAYS } from "./check-availability";
import {
  businessDayWindow,
  formatLongDate,
  formatTime,
  localDateKey,
  parseDateTimeInZone,
  resolveDayHours,
} from "../../domain/time";
import type { Appointment } from "../../domain/types";
import { CalendarUnavailableError } from "../../services/calendar";
import type { ToolContext } from "../context";
import type { ToolResult } from "../tools";

const Args = z.object({
  caller_name: z.string().trim().min(1).max(120),
  caller_phone: z.string().trim().max(40).optional(),
  date_time: z.string().trim().min(1),
  reason: z.string().trim().max(200).optional(),
});

const UNAVAILABLE =
  "Live scheduling is not available right now. Apologize and offer to take a message so the team can call back to book.";

function confirmation(
  appt: Pick<Appointment, "caller_name" | "start_time" | "duration_min" | "reason">,
  tz: string,
) {
  const start = new Date(appt.start_time);
  return `Booked: ${appt.caller_name} on ${formatLongDate(start, tz)} at ${formatTime(start, tz)} for ${appt.duration_min} minutes${appt.reason ? ` (${appt.reason})` : ""}. Confirm these details with the caller.`;
}

export async function bookAppointment(raw: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success) {
    return {
      result: "I need the caller's name and the chosen time before booking. Ask for whichever is missing.",
    };
  }
  const args = parsed.data;
  const { business, deps, call } = ctx;
  if (!business || !deps.calendar) return { result: UNAVAILABLE };

  const tz = business.timezone;
  const start = parseDateTimeInZone(args.date_time, tz);
  if (!start) {
    return { result: "I couldn't read that time. Ask the caller to repeat the day and time." };
  }
  const duration = business.appointment_duration_min || 30;
  const end = new Date(start.getTime() + duration * 60_000);

  // Enforce the same horizon check_availability applies, so the model cannot
  // skip the availability step and book years out (e.g. a mis-parsed year).
  const now = deps.now();
  if (start.getTime() < now.getTime()) {
    return { result: "That time is in the past. Ask the caller for a future date and call check_availability." };
  }
  if (start.getTime() > now.getTime() + MAX_BOOKING_HORIZON_DAYS * 86_400_000) {
    return {
      result: `Appointments can be booked at most ${MAX_BOOKING_HORIZON_DAYS} days ahead. Offer the caller a nearer date.`,
    };
  }

  // Vapi retries tool calls on network errors. Same call + same start time
  // means we already booked it; confirm instead of double-booking.
  const existing = await deps.repo.findAppointmentForCall(call.id, start.toISOString());
  if (existing) return { result: confirmation(existing, tz) };

  const dateKey = localDateKey(start, tz);
  const hours = resolveDayHours(dateKey, business.business_hours);
  const window = hours ? businessDayWindow(dateKey, hours, tz) : null;

  let busy;
  try {
    busy = window ? await deps.calendar.listBusy(business.id, business.calendar_id || "primary", window) : [];
  } catch (err) {
    if (err instanceof CalendarUnavailableError) return { result: UNAVAILABLE };
    throw err;
  }

  const check = checkRequestedSlot({ slot: { start, end }, window, busy, now: deps.now() });
  if (!check.ok) {
    const reasons = {
      outside_hours: "That time is outside opening hours.",
      too_soon: "That time is too soon to book; appointments need at least an hour's notice.",
      conflict: "That time is no longer available.",
    } as const;
    return {
      result: `${reasons[check.reason]} Call check_availability for ${dateKey} and offer the caller another time.`,
    };
  }

  const callerPhone = normalizeE164(args.caller_phone) ?? ctx.callerNumber;
  let eventId: string | null;
  try {
    const event = await deps.calendar.createEvent(business.id, business.calendar_id || "primary", {
      summary: `${args.reason ? `${args.reason} · ` : ""}${args.caller_name}`,
      description: [
        "Booked by the VoiceDesk AI receptionist.",
        `Caller: ${args.caller_name}`,
        callerPhone ? `Phone: ${callerPhone}` : null,
        args.reason ? `Reason: ${args.reason}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      start,
      end,
      timeZone: tz,
    });
    eventId = event.id;
  } catch (err) {
    if (err instanceof CalendarUnavailableError) return { result: UNAVAILABLE };
    throw err;
  }

  const appt = await deps.repo.insertAppointment({
    business_id: business.id,
    caller_name: args.caller_name,
    caller_phone: callerPhone,
    service_type: args.reason ?? "general",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    duration_min: duration,
    reason: args.reason ?? null,
    google_event_id: eventId,
    status: "confirmed",
    _vapi_call_id: call.id,
  });

  deps.logger.info("tool.appointment_booked", { businessId: business.id, callId: call.id });
  return { result: confirmation(appt, tz) };
}
