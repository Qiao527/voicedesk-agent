import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabase } from "../services/supabase";
import {
  CalendarIntegrationError,
  getAvailableSlots,
  bookAppointment,
  parseDateTimeInTimezone,
  resolveDayHours,
} from "../services/calendar";
import { sendSms } from "../services/notification";
import { normalizeE164, maskPhone } from "../services/phone";

export const vapiWebhookRouter = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────

const EventTypeEnvelopeSchema = z.object({
  type: z.string(),
}).passthrough();

const CallContextSchema = z.object({
  id: z.string(),
  phoneNumberId: z.string().optional().nullable(),
  phoneNumber: z.object({ number: z.string() }).optional().nullable(),
  customer: z.object({ number: z.string() }).optional().nullable(),
  duration: z.number().optional().nullable(),
  endedReason: z.string().optional().nullable(),
});

const AssistantRequestSchema = z.object({
  type: z.literal("assistant-request"),
  call: CallContextSchema,
});

const FunctionCallSchema = z.object({
  type: z.literal("function-call"),
  call: CallContextSchema,
  functionCall: z.object({
    name: z.string(),
    parameters: z.record(z.unknown()),
  }),
});

// Vapi sends tool calls in OpenAI format: { id, type, function: { name, arguments } }
// We also support the older flat format: { id, name, parameters }
const ToolCallItemSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  // New OpenAI-style format
  function: z
    .object({
      name: z.string(),
      // Vapi may send arguments as a JSON string or a pre-parsed object
      arguments: z.union([z.record(z.unknown()), z.string()]).optional(),
    })
    .optional(),
  // Old flat format
  name: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

const ToolCallsSchema = z.object({
  type: z.literal("tool-calls"),
  call: CallContextSchema,
  toolCallList: z.array(ToolCallItemSchema).default([]),
});

const EndOfCallReportSchema = z.object({
  type: z.literal("end-of-call-report"),
  call: CallContextSchema,
  summary: z.string().optional(),
  transcript: z.string().optional(),
  recordingUrl: z.string().optional(),
  // Vapi reports total call cost in USD (Vapi + LLM + transcriber + telephony).
  // We persist as integer cents so dashboard analytics can sum without float drift.
  cost: z.number().optional(),
});

const WrappedWebhookMessageSchema = z.object({
  message: EventTypeEnvelopeSchema,
});

// ─── Types ───────────────────────────────────────────────────────────

interface Business {
  id: string;
  name: string;
  phone: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  address: string | null;
  vapi_phone_number: string;
  vapi_assistant_id: string | null;
  vapi_phone_id: string | null;
  calendar_id: string;
  timezone: string;
  business_hours: Record<string, string>;
  greeting_message: string | null;
  recording_disclosure: string | null;
  system_prompt_override: string | null;
  voice_provider: string;
  voice_id: string;
  plan: string;
  monthly_fee: number;
  status: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

// ─── Main Route ──────────────────────────────────────────────────────

vapiWebhookRouter.post("/", async (req: Request, res: Response) => {
  const message = extractWebhookMessage(req.body);
  if (!message) {
    console.error("Invalid Vapi webhook payload:", req.body);
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  try {
    const LOGGED_EVENTS = new Set(["assistant-request", "function-call", "tool-calls", "end-of-call-report"]);
    if (LOGGED_EVENTS.has(message.type)) {
      console.log("Vapi webhook event:", message.type);
    }

    switch (message.type) {
      case "assistant-request": {
        const msg = AssistantRequestSchema.parse(message);
        const result = await handleAssistantRequest(msg);
        res.json(result);
        return;
      }

      case "function-call": {
        const msg = FunctionCallSchema.parse(message);
        const result = await handleFunctionCall(msg);
        res.json(result);
        return;
      }

      case "tool-calls": {
        const msg = ToolCallsSchema.parse(message);
        const result = await handleToolCalls(msg);
        res.json(result);
        return;
      }

      case "end-of-call-report": {
        const msg = EndOfCallReportSchema.parse(message);
        await handleEndOfCallReport(msg);
        res.json({ ok: true });
        return;
      }

      default:
        res.json({ ok: true });
        return;
    }
  } catch (err) {
    console.error(`Webhook error [${message.type}]:`, err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Business Lookup ─────────────────────────────────────────────────

async function resolveBusiness(
  call: z.infer<typeof CallContextSchema>,
): Promise<Business | null> {
  // Try by the dialed phone number first. Uses maybeSingle so duplicate or
  // missing rows surface as null-with-warning instead of a thrown PGRST error.
  const phoneNumber = call.phoneNumber?.number;
  if (phoneNumber) {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("vapi_phone_number", phoneNumber)
      .maybeSingle();
    if (error) console.warn("[resolveBusiness] lookup by phoneNumber failed:", error.message);
    if (data) return data;
  }

  const phoneNumberId = call.phoneNumberId;
  if (phoneNumberId) {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("vapi_phone_id", phoneNumberId)
      .maybeSingle();
    if (error) console.warn("[resolveBusiness] lookup by phoneNumberId failed:", error.message);
    if (data) return data;
  }

  console.warn(
    "Could not resolve business — phoneNumber:",
    maskPhone(phoneNumber),
    "phoneNumberId:",
    call.phoneNumberId,
  );
  return null;
}

async function getFaqsForBusiness(businessId: string): Promise<FaqItem[]> {
  const { data } = await supabase
    .from("faq_items")
    .select("question, answer")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });

  return data || [];
}

// ─── assistant-request ───────────────────────────────────────────────
// Vapi calls this when a new call comes in. We look up the business
// by the dialed phone number and return a tailored assistant config
// with the business's greeting, FAQs baked into the system prompt,
// and all 4 tool definitions.

async function handleAssistantRequest(
  message: z.infer<typeof AssistantRequestSchema>,
) {
  const business = await resolveBusiness(message.call);

  if (!business) {
    return { assistant: buildDefaultAssistant() };
  }

  const faqs = await getFaqsForBusiness(business.id);

  return { assistant: buildAssistantForBusiness(business, faqs) };
}

function buildAssistantForBusiness(business: Business, faqs: FaqItem[]) {
  const timezone = business.timezone || "America/New_York";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const faqBlock =
    faqs.length > 0
      ? `\n\nFAQ — use these to answer common questions:\n${faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")}`
      : "";

  const hoursBlock = business.business_hours
    ? `\nBusiness hours: ${JSON.stringify(business.business_hours)}`
    : "";

  const dateHeader = `Today is ${today} (${timezone}). When a caller says "today", "tomorrow", or a day of the week, resolve it against this date. When invoking book_appointment, pass date_time as ISO 8601 wall-clock time without a timezone offset (e.g. "2026-04-17T14:00:00") — the server interprets it in the business timezone.`;

  // Only attach the transfer tool if we have a dial-able E.164 destination.
  // Otherwise the AI would promise a transfer it has no way to execute.
  const transferDestination = normalizeE164(business.owner_phone);
  if (business.owner_phone && !transferDestination) {
    console.warn(
      `[assistant] business ${business.id} owner_phone ${maskPhone(business.owner_phone)} is not valid E.164 — transferCall disabled`,
    );
  }

  const transferGuidance = transferDestination
    ? `If the caller asks to speak to a human, asks for the owner, or explicitly wants to be transferred, use your transferCall tool to forward them. Do not invent a hold time — Vapi will play the hold message for you.`
    : `Transfer to a human is NOT available for this business. If the caller asks for a human, politely say the owner isn't reachable right now and offer to take a detailed message instead. Do not promise a transfer or callback time.`;

  // If the owner wrote a custom prompt, still prepend the date header so the AI
  // doesn't hallucinate a year. Otherwise use the default prompt template.
  const basePrompt =
    business.system_prompt_override ||
    `You are a friendly AI receptionist for ${business.name}. You answer phone calls on their behalf.

Your responsibilities:
1. Greet the caller warmly
2. Determine their intent — book an appointment, ask a question, leave a message, or speak to someone
3. For appointments: first check available time slots, then book once the caller picks one
4. For questions: answer using the FAQ list below. If you don't know, offer to take a message.
5. For messages: collect the caller's name, phone number, and message
6. For transfers: ${transferGuidance}

Always confirm important details (name, phone number, appointment time) before taking action. Be concise.
Timezone: ${timezone}${hoursBlock}${faqBlock}`;

  // If the owner supplied a custom prompt, we still need to tell the AI about
  // transfer availability — their prompt can't know the runtime state.
  const systemPrompt = business.system_prompt_override
    ? `${dateHeader}\n\n${basePrompt}\n\nTransfer policy: ${transferGuidance}`
    : `${dateHeader}\n\n${basePrompt}`;

  // Custom webhook functions: check_availability, book_appointment, take_message.
  // transfer_to_human is handled by Vapi's built-in transferCall tool below, not
  // as a custom function, so Vapi actually forwards the live call.
  const webhookFunctions = TOOL_DEFINITIONS.filter(
    (t) => t.name !== "transfer_to_human",
  );

  // Vapi built-in tools that execute without calling our webhook.
  const builtinTools = transferDestination
    ? [
        {
          type: "transferCall",
          destinations: [
            {
              type: "number",
              number: transferDestination,
              message: `Please hold while I connect you to ${business.name}.`,
            },
          ],
        },
      ]
    : [];

  return {
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "system", content: systemPrompt }],
      functions: webhookFunctions,
      tools: builtinTools,
    },
    voice: {
      provider: business.voice_provider || "11labs",
      voiceId: business.voice_id || "paula",
    },
    // Legal compliance: two-party-consent states (CA, FL, IL, MD, MA, MT, NV,
    // NH, PA, WA) require callers be notified before recording. We prepend
    // the disclosure to the greeting so Vapi speaks it before the AI turn.
    firstMessage: [
      business.recording_disclosure,
      business.greeting_message ||
        `Hello! Thanks for calling ${business.name}. How can I help you today?`,
    ]
      .filter((s) => s && s.trim().length > 0)
      .join(" "),
    endCallMessage: "Thank you for calling. Have a great day!",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en",
    },
    recordingEnabled: true,
    endCallFunctionEnabled: true,
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
  };
}

function buildDefaultAssistant() {
  const fallbackTz = "America/New_York";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: fallbackTz,
  });
  return {
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messages: [
        {
          role: "system",
          content: `Today is ${today} (${fallbackTz}). When invoking book_appointment, pass date_time as ISO 8601 wall-clock time without a timezone offset.\n\nYou are a friendly AI receptionist. Greet the caller, determine what they need, and help them. You can check appointment availability, book appointments, or take messages.`,
        },
      ],
      functions: TOOL_DEFINITIONS.filter((t) => t.name !== "transfer_to_human"),
    },
    voice: { provider: "11labs", voiceId: "paula" },
    firstMessage: "Hello! Thanks for calling. How can I help you today?",
    endCallMessage: "Thank you for calling. Have a great day!",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en",
    },
    recordingEnabled: true,
    endCallFunctionEnabled: true,
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
  };
}

const TOOL_DEFINITIONS = [
  {
    name: "check_availability",
    description:
      "Check available appointment slots on a given date. Call this BEFORE booking so the caller can choose a time.",
    parameters: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "The date to check, in YYYY-MM-DD format",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment after the caller has chosen a specific time slot.",
    parameters: {
      type: "object" as const,
      properties: {
        caller_name: {
          type: "string",
          description: "Caller's full name",
        },
        caller_phone: {
          type: "string",
          description: "Caller's phone number for confirmation",
        },
        date_time: {
          type: "string",
          description:
            "The chosen appointment start time in ISO 8601 wall-clock format WITHOUT a timezone offset, e.g. '2026-04-17T14:00:00'. The server will interpret this in the business's local timezone.",
        },
        duration_minutes: {
          type: "number",
          description: "Appointment duration in minutes. Default 30.",
        },
        reason: {
          type: "string",
          description: "Reason or type of appointment (e.g. haircut, consultation)",
        },
      },
      required: ["caller_name", "date_time"],
    },
  },
  {
    name: "take_message",
    description:
      "Take a message when the caller wants to leave one for the business.",
    parameters: {
      type: "object" as const,
      properties: {
        caller_name: { type: "string", description: "Caller's name" },
        caller_phone: { type: "string", description: "Caller's phone number" },
        message: { type: "string", description: "The message content" },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high"],
          description:
            "How urgent the message is, based on the caller's tone and content",
        },
      },
      required: ["caller_name", "message"],
    },
  },
  // NOTE: transfer_to_human is intentionally NOT a custom webhook function.
  // It's declared as a built-in Vapi `transferCall` tool in
  // buildAssistantForBusiness, so Vapi actually forwards the live call
  // instead of just having the AI speak a transfer message.
];

function extractWebhookMessage(body: unknown) {
  const wrapped = WrappedWebhookMessageSchema.safeParse(body);
  if (wrapped.success) {
    return wrapped.data.message;
  }

  const raw = EventTypeEnvelopeSchema.safeParse(body);
  if (raw.success) {
    return raw.data;
  }

  return null;
}

// ─── function-call ───────────────────────────────────────────────────
// Vapi calls this when Claude decides to use a tool during the
// conversation. We dispatch to the right handler, then return a
// { result: string } that Vapi feeds back to Claude.

async function handleFunctionCall(
  message: z.infer<typeof FunctionCallSchema>,
) {
  const { name, parameters } = message.functionCall;
  const business = await resolveBusiness(message.call);

  const handlers: Record<
    string,
    (params: Record<string, unknown>, biz: Business | null) => Promise<string>
  > = {
    check_availability: (params, biz) =>
      handleCheckAvailability(params, biz),
    book_appointment: (params, biz) =>
      handleBookAppointment(params, biz, message.call),
    take_message: (params, biz) =>
      handleTakeMessage(params, biz, message.call),
  };

  const handler = handlers[name];
  if (!handler) {
    console.warn(`Unknown function call: ${name}`);
    return { result: "Sorry, that action is not available." };
  }

  try {
    const result = await handler(parameters, business);
    return { result };
  } catch (err) {
    console.error(`Function call error [${name}]:`, err);
    return {
      result:
        "I'm sorry, I ran into a technical issue. Let me take a message instead so someone can follow up with you.",
    };
  }
}

async function handleToolCalls(message: z.infer<typeof ToolCallsSchema>) {
  const business = await resolveBusiness(message.call);

  const results = await Promise.all(
    message.toolCallList.map(async (toolCall) => {
      // Support both OpenAI-style { function: { name, arguments } } and
      // older flat { name, parameters } formats from Vapi.
      const name = toolCall.function?.name ?? toolCall.name ?? "";
      const rawArgs = toolCall.function?.arguments ?? toolCall.parameters ?? {};
      const parameters: Record<string, unknown> =
        typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
      const result = await executeToolCall(name, parameters, business, message.call);
      return {
        name,
        toolCallId: toolCall.id,
        result,
      };
    }),
  );

  return { results };
}

async function executeToolCall(
  name: string,
  parameters: Record<string, unknown>,
  business: Business | null,
  call: z.infer<typeof CallContextSchema>,
): Promise<string> {
  const handlers: Record<
    string,
    (params: Record<string, unknown>, biz: Business | null) => Promise<string>
  > = {
    check_availability: (params, biz) =>
      handleCheckAvailability(params, biz),
    book_appointment: (params, biz) =>
      handleBookAppointment(params, biz, call),
    take_message: (params, biz) =>
      handleTakeMessage(params, biz, call),
  };

  const handler = handlers[name];
  if (!handler) {
    console.warn(`Unknown tool call: ${name}`);
    return "Sorry, that action is not available.";
  }

  try {
    return await handler(parameters, business);
  } catch (err) {
    console.error(`Tool call error [${name}]:`, err);
    return "I'm sorry, I ran into a technical issue. Let me take a message instead so someone can follow up with you.";
  }
}

// ── check_availability ───────────────────────────────────────────────

const CheckAvailabilityParams = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function handleCheckAvailability(
  params: Record<string, unknown>,
  business: Business | null,
): Promise<string> {
  console.log("[check_availability] params:", JSON.stringify(params));
  console.log("[check_availability] business:", business?.id ?? "NULL");

  const parsed = CheckAvailabilityParams.safeParse(params);
  if (!parsed.success) {
    console.error("[check_availability] bad date format:", params.date);
    return `I'm sorry, I need the date in YYYY-MM-DD format. What date would you like to check?`;
  }
  const { date } = parsed.data;

  if (!business?.id) {
    console.error("[check_availability] no business found");
    return "I'm sorry, appointment scheduling is not configured for this business yet. Please offer to take a message instead.";
  }

  const timezone = business.timezone || "America/New_York";
  const dayHours = resolveDayHours(date, business.business_hours, timezone);
  if (!dayHours) {
    return `The business is closed on ${date}. Offer the caller another day that falls within business hours.`;
  }

  let slots;
  try {
    console.log("[check_availability] querying calendar for", date);
    slots = await getAvailableSlots({
      businessId: business.id,
      date,
      timezone,
      dayHours,
      calendarId: business.calendar_id || "primary",
    });
    console.log("[check_availability] slots found:", slots.length);
  } catch (error) {
    console.error("[check_availability] calendar error:", error);
    if (error instanceof CalendarIntegrationError) {
      return "I'm sorry, live scheduling is not available right now. Please offer to take a message so the business can call back.";
    }
    throw error;
  }

  if (slots.length === 0) {
    return `No available slots on ${date}. Please suggest the caller try another day.`;
  }

  const formatted = slots.map((s) => {
    const d = new Date(s.start);
    return d.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  });

  return `Available times on ${date}: ${formatted.join(", ")}. Ask the caller which time works best.`;
}

// ── book_appointment ─────────────────────────────────────────────────

const BookAppointmentParams = z.object({
  caller_name: z.string().min(1),
  caller_phone: z.string().optional(),
  date_time: z.string(),
  duration_minutes: z.number().min(15).max(240).optional(),
  reason: z.string().optional(),
});

async function handleBookAppointment(
  params: Record<string, unknown>,
  business: Business | null,
  call: z.infer<typeof CallContextSchema>,
): Promise<string> {
  const {
    caller_name,
    caller_phone,
    date_time,
    duration_minutes,
    reason,
  } = BookAppointmentParams.parse(params);

  const duration = duration_minutes || 30;
  const timezone = business?.timezone || "America/New_York";

  // Interpret date_time in the business timezone unless AI sent an explicit
  // tz offset. Protects against UTC misinterpretation on the server.
  const startTime = parseDateTimeInTimezone(date_time, timezone);
  if (Number.isNaN(startTime.getTime())) {
    console.error("[book_appointment] invalid date_time:", date_time);
    return "I couldn't understand that time. Could you repeat the date and time?";
  }
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

  if (!business?.id) {
    return "I'm sorry, appointment booking is not configured for this business yet. Please offer to take a message instead.";
  }

  // Idempotency: Vapi retries tool-calls on network hiccups. If we've already
  // booked this exact (vapi_call_id, start_time) tuple for this call, return
  // the existing confirmation instead of double-booking the calendar.
  const { data: existingAppt } = await supabase
    .from("appointments")
    .select("id, caller_name, start_time, duration_min, reason")
    .eq("_vapi_call_id", call.id)
    .eq("start_time", startTime.toISOString())
    .maybeSingle();
  if (existingAppt) {
    console.log(
      `[book_appointment] duplicate tool-call for call ${call.id} @ ${startTime.toISOString()} — returning existing row`,
    );
    const tz = business.timezone || "America/New_York";
    const existingTime = new Date(existingAppt.start_time).toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const existingDate = new Date(existingAppt.start_time).toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return `Appointment already confirmed for ${existingAppt.caller_name} on ${existingDate} at ${existingTime}.`;
  }

  let event;
  try {
    event = await bookAppointment({
      businessId: business.id,
      summary: reason
        ? `${reason} — ${caller_name}`
        : `Appointment — ${caller_name}`,
      description: [
        `Booked by VoiceDesk AI`,
        `Caller: ${caller_name}`,
        caller_phone ? `Phone: ${caller_phone}` : null,
        reason ? `Reason: ${reason}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      startTime: startTime.toISOString(),
      durationMinutes: duration,
      calendarId: business.calendar_id || "primary",
    });
  } catch (error) {
    if (error instanceof CalendarIntegrationError) {
      return "I'm sorry, live scheduling is not available right now. Please offer to take a message so the business can follow up.";
    }
    throw error;
  }

  const { error: insertErr } = await supabase.from("appointments").insert({
    business_id: business.id,
    call_id: null,
    caller_name,
    caller_phone: caller_phone || call.customer?.number || null,
    service_type: reason || "general",
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_min: duration,
    reason: reason || null,
    google_event_id: event.id || null,
    status: "confirmed",
    _vapi_call_id: call.id,
  });
  if (insertErr) {
    console.error("[book_appointment] failed to persist appointment row:", insertErr.message);
  }

  const timeStr = startTime.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = startTime.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return `Appointment confirmed for ${caller_name} on ${dateStr} at ${timeStr} (${duration} minutes). ${reason ? `Reason: ${reason}. ` : ""}They're all set!`;
}

// ── take_message ─────────────────────────────────────────────────────

const TakeMessageParams = z.object({
  caller_name: z.string().min(1),
  caller_phone: z.string().optional(),
  message: z.string().min(1),
  urgency: z.enum(["low", "medium", "high"]).optional(),
});

async function handleTakeMessage(
  params: Record<string, unknown>,
  business: Business | null,
  call: z.infer<typeof CallContextSchema>,
): Promise<string> {
  const { caller_name, caller_phone, message, urgency } =
    TakeMessageParams.parse(params);

  const { error: insertErr } = await supabase.from("messages").insert({
    business_id: business?.id || null,
    call_id: null,
    _vapi_call_id: call.id,
    caller_name,
    caller_phone: caller_phone || call.customer?.number || null,
    content: message,
    urgency: urgency || "medium",
    is_read: false,
  });
  if (insertErr) {
    console.error("[take_message] failed to persist message row:", insertErr.message);
  }

  const smsTo = normalizeE164(business?.owner_phone);
  if (smsTo) {
    const preview =
      message.length > 80 ? message.substring(0, 80) + "…" : message;
    await sendSms(
      smsTo,
      `[VoiceDesk] New ${urgency || "medium"}-priority message from ${caller_name}: "${preview}"`,
    );
  }

  return `Message saved. ${business?.name || "The team"} will get back to ${caller_name} as soon as possible.`;
}

// ─── end-of-call-report ──────────────────────────────────────────────
// Sent once after the call ends. We:
// 1. Save the call record to the `calls` table
// 2. Link any appointments that were booked during this call
// 3. SMS the business owner with a summary

async function handleEndOfCallReport(
  message: z.infer<typeof EndOfCallReportSchema>,
) {
  const { call, summary, transcript, recordingUrl, cost } = message;
  const business = await resolveBusiness(call);
  const callerNumber = call.customer?.number || "unknown";

  // 1. Check what happened during the call so we can set outcome. Both
  //    tables carry _vapi_call_id, so we link by call id (not by time window)
  //    to avoid misattributing concurrent calls' messages.
  const [appointmentsRes, messagesRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("caller_name, start_time, reason")
      .eq("_vapi_call_id", call.id),
    supabase
      .from("messages")
      .select("id")
      .eq("_vapi_call_id", call.id),
  ]);
  if (appointmentsRes.error) {
    console.error("[end-of-call] appointments lookup failed:", appointmentsRes.error.message);
  }
  if (messagesRes.error) {
    console.error("[end-of-call] messages lookup failed:", messagesRes.error.message);
  }
  const appointments = appointmentsRes.data;
  const messages = messagesRes.data;

  // Vapi emits a handful of different endedReason strings for live transfers
  // depending on the underlying provider, and we want the owner to see all of
  // them as "transferred" in the dashboard.
  //   success:  assistant-forwarded-call, twilio-forwarded-call,
  //             customer-ended-call after a forward, etc.
  //   failure:  pipeline-error-forwarding-call-failed
  const endedReason = call.endedReason || "";
  const transferFailed = /forwarding-call-failed/i.test(endedReason);
  const transferSucceeded =
    !transferFailed &&
    (/forwarded-call/i.test(endedReason) || /transfer/i.test(endedReason));

  function deriveOutcome(): string {
    if (appointments && appointments.length > 0) return "appointment_booked";
    if (messages && messages.length > 0) return "message_taken";
    if (transferSucceeded) return "transferred";
    return "other";
  }

  // 2. Upsert call log (idempotent on vapi_call_id). Vapi retries
  // end-of-call-report on failure; without upsert the unique index would 409.
  const { data: callRecord, error: callInsertErr } = await supabase
    .from("calls")
    .upsert(
      {
        business_id: business?.id || null,
        vapi_call_id: call.id,
        caller_number: callerNumber,
        direction: "inbound",
        status: "completed",
        duration_seconds: call.duration || 0,
        summary: summary || "",
        transcript: transcript || "",
        recording_url: recordingUrl || null,
        ended_reason: call.endedReason || null,
        outcome: deriveOutcome(),
        cost_cents:
          typeof cost === "number" ? Math.round(cost * 100) : null,
      },
      { onConflict: "vapi_call_id" },
    )
    .select("id")
    .maybeSingle();
  if (callInsertErr) {
    console.error("[end-of-call] failed to insert call row:", callInsertErr.message);
  }

  // 3. Link appointments + messages booked during this call
  if (callRecord?.id) {
    const [apptLink, msgLink] = await Promise.all([
      supabase
        .from("appointments")
        .update({ call_id: callRecord.id })
        .eq("_vapi_call_id", call.id),
      supabase
        .from("messages")
        .update({ call_id: callRecord.id })
        .eq("_vapi_call_id", call.id),
    ]);
    if (apptLink.error) {
      console.error("[end-of-call] appointment link failed:", apptLink.error.message);
    }
    if (msgLink.error) {
      console.error("[end-of-call] message link failed:", msgLink.error.message);
    }
  }

  // 4. SMS the business owner
  // (appointments was already fetched above for outcome derivation)
  const ownerSmsDestination = normalizeE164(business?.owner_phone);
  if (ownerSmsDestination) {
    const smsBody = buildEndOfCallSms({
      businessName: business!.name,
      callerNumber,
      durationSeconds: call.duration || 0,
      summary: summary || null,
      appointments: appointments || [],
      transferFailed,
    });

    await sendSms(ownerSmsDestination, smsBody);
  } else if (business?.owner_phone) {
    console.warn(
      `[end-of-call] business ${business.id} owner_phone ${maskPhone(business.owner_phone)} is not valid E.164 — skipping SMS`,
    );
  }
}

function buildEndOfCallSms(params: {
  businessName: string;
  callerNumber: string;
  durationSeconds: number;
  summary: string | null;
  appointments: Array<{
    caller_name: string;
    start_time: string;
    reason: string | null;
  }>;
  transferFailed?: boolean;
}): string {
  const mins = Math.ceil(params.durationSeconds / 60);
  const lines: string[] = [
    `[VoiceDesk] Call summary for ${params.businessName}`,
    `From: ${params.callerNumber} (${mins}min)`,
  ];

  // Surface transfer failure prominently — the caller wanted to reach a human
  // and didn't, so the owner should call them back. The caller number is
  // already shown in the "From:" line above, so we don't repeat it here.
  if (params.transferFailed) {
    lines.push(
      `WARNING: transfer to you failed. The caller tried to reach you live — please call back.`,
    );
  }

  if (params.summary) {
    const short =
      params.summary.length > 120
        ? params.summary.substring(0, 120) + "…"
        : params.summary;
    lines.push(`AI summary: ${short}`);
  }

  for (const appt of params.appointments) {
    const time = new Date(appt.start_time).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    lines.push(
      `Booked: ${appt.caller_name} — ${time}${appt.reason ? ` (${appt.reason})` : ""}`,
    );
  }

  return lines.join("\n");
}
