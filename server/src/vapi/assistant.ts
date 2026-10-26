import { normalizeE164 } from "../domain/phone";
import { describeBusinessHours } from "../domain/time";
import type { Business, FaqItem } from "../domain/types";

export interface VoiceSettings {
  model: string;
  voiceProvider: string;
  voiceId: string;
}

export const TOOL_NAMES = {
  checkAvailability: "check_availability",
  bookAppointment: "book_appointment",
  takeMessage: "take_message",
} as const;

/**
 * Function tools the assistant can call. Vapi posts `tool-calls` to the phone
 * number's server URL, which keeps the org webhook credential attached.
 */
export const FUNCTION_TOOLS = [
  {
    type: "function",
    function: {
      name: TOOL_NAMES.checkAvailability,
      description:
        "List open appointment times on a date. Always call this before book_appointment so the caller can pick a time that is actually free.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date to check, formatted YYYY-MM-DD." },
        },
        required: ["date"],
      },
    },
    messages: [{ type: "request-start", content: "Let me check the calendar." }],
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.bookAppointment,
      description:
        "Book an appointment once the caller has chosen one of the times returned by check_availability and confirmed their name.",
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string", description: "Caller's full name." },
          caller_phone: {
            type: "string",
            description:
              "Callback number if the caller gave one. Omit to use the number they are calling from.",
          },
          date_time: {
            type: "string",
            description:
              "Chosen start time as local wall-clock ISO 8601 without an offset, e.g. 2026-04-17T14:00:00.",
          },
          reason: { type: "string", description: "What the appointment is for, in a few words." },
        },
        required: ["caller_name", "date_time"],
      },
    },
    messages: [{ type: "request-start", content: "One moment while I book that." }],
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.takeMessage,
      description:
        "Record a message for the business owner. Use when the caller wants a callback, when you cannot answer, or when a transfer is not possible.",
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string", description: "Caller's name." },
          caller_phone: {
            type: "string",
            description: "Best callback number, if different from the calling number.",
          },
          message: { type: "string", description: "The message, in the caller's words where possible." },
          urgency: {
            type: "string",
            enum: ["low", "medium", "high"],
            description:
              "high for emergencies, pain, or time-sensitive issues; low for general info requests.",
          },
        },
        required: ["caller_name", "message"],
      },
    },
  },
] as const;

const BASE_RULES = `How to speak:
- You are on a phone call. Keep replies to one or two short sentences. Never use lists, markdown, or emoji.
- Say times and dates the way people do ("Tuesday the 14th at 2:30"), never ISO formats.
- When you collect a phone number, read it back once to confirm.
- If you did not catch something, ask once. If it is still unclear, offer to take a message.

What you must not do:
- Do not give medical, legal, or financial advice. Offer to take a message for the team instead.
- Do not quote prices, insurance coverage, or policies unless they are in the FAQ below.
- Do not share information about other customers or appointments.
- Do not invent availability. Only offer times returned by check_availability.
- If someone asks whether you are an AI, say yes, and offer to take a message for a person.`;

function faqBlock(faqs: FaqItem[]): string {
  if (faqs.length === 0)
    return "There is no FAQ for this business yet. Offer to take a message for questions you cannot answer.";
  return `FAQ (answer only from this list):\n${faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")}`;
}

/** The system prompt for a business. Exported for tests and the prompt preview. */
export function buildSystemPrompt(business: Business, faqs: FaqItem[], now: Date): string {
  const tz = business.timezone || "America/New_York";
  const canTransfer = Boolean(normalizeE164(business.owner_phone));

  const today = now.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const header = `Today is ${today}. Time zone: ${tz}. Resolve "today", "tomorrow" and weekday names against this date.`;

  const transferRule = canTransfer
    ? "If the caller asks for a person or the owner, or has an emergency, use the transferCall tool. If the transfer fails, take a message."
    : "Live transfer is not available for this business. If the caller asks for a person, say the team is not available right now and offer to take a message. Do not promise a callback time.";

  if (business.system_prompt_override) {
    return [
      header,
      business.system_prompt_override.trim(),
      `Transfers: ${transferRule}`,
      BASE_RULES,
      faqBlock(faqs),
    ].join("\n\n");
  }

  const details = [
    `Business: ${business.name}`,
    business.address ? `Address: ${business.address}` : null,
    `Opening hours: ${describeBusinessHours(business.business_hours)}`,
    `Standard appointment length: ${business.appointment_duration_min || 30} minutes`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    header,
    `You are the receptionist for ${business.name}. You answer the phone warmly and efficiently, like an experienced front-desk professional.`,
    details,
    `Your job, in order of priority:
1. Find out what the caller needs.
2. Booking: ask for the preferred day, call check_availability, offer two or three of the returned times, confirm the caller's name, then call book_appointment. Repeat the confirmed time back.
3. Questions: answer from the FAQ. If it is not covered, say you will pass the question on and take a message.
4. Messages: get their name, the message, and confirm the callback number, then call take_message.
5. ${transferRule}`,
    BASE_RULES,
    faqBlock(faqs),
  ].join("\n\n");
}

export function buildFirstMessage(business: Business): string {
  const greeting =
    business.greeting_message?.trim() || `Thanks for calling ${business.name}, how can I help you today?`;
  return [business.recording_disclosure?.trim(), greeting].filter(Boolean).join(" ");
}

function commonSettings(voice: VoiceSettings) {
  return {
    voice: { provider: voice.voiceProvider, voiceId: voice.voiceId },
    transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
    artifactPlan: {
      recordingEnabled: true,
      transcriptPlan: { enabled: true, assistantName: "AI", userName: "Caller" },
    },
    endCallMessage: "Thanks for calling. Have a great day!",
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
  };
}

/** Transient assistant returned from the `assistant-request` webhook. */
export function buildAssistant(business: Business, faqs: FaqItem[], voice: VoiceSettings, now: Date) {
  const transferNumber = normalizeE164(business.owner_phone);
  const tools: object[] = [...FUNCTION_TOOLS, { type: "endCall" }];
  if (transferNumber) {
    tools.push({
      type: "transferCall",
      destinations: [
        {
          type: "number",
          number: transferNumber,
          message: `Please hold while I connect you to someone at ${business.name}.`,
        },
      ],
    });
  }

  return {
    name: `${business.name} receptionist`.slice(0, 40),
    firstMessage: buildFirstMessage(business),
    model: {
      provider: "anthropic",
      model: voice.model,
      temperature: 0.3,
      messages: [{ role: "system", content: buildSystemPrompt(business, faqs, now) }],
      tools,
    },
    metadata: { businessId: business.id },
    ...commonSettings(voice),
  };
}

/**
 * Used when a call arrives on a number we don't recognize. The caller still
 * gets a polite answer and can leave a message (stored without a business so
 * an operator can spot misconfigured numbers).
 */
export function buildFallbackAssistant(voice: VoiceSettings) {
  return {
    name: "VoiceDesk fallback",
    firstMessage:
      "Thanks for calling. I can take a message so the team can get back to you. What's your name?",
    model: {
      provider: "anthropic",
      model: voice.model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You answer calls for a business whose details are unavailable. Do not guess the business name, hours or services. Politely collect the caller's name, callback number and message, then call take_message and end the call.\n\n${BASE_RULES}`,
        },
      ],
      tools: [FUNCTION_TOOLS[2], { type: "endCall" }],
    },
    ...commonSettings(voice),
  };
}
