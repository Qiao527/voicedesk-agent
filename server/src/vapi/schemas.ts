import { z } from "zod";

/**
 * Vapi server-message schemas. Vapi adds fields over time, so every object is
 * `loose`: we validate what we read and pass through the rest. Fields that
 * moved between API versions (transcript, recording, summary) are read from
 * both the legacy top-level location and the newer `artifact` / `analysis`.
 */

export const CallContextSchema = z.looseObject({
  id: z.string().min(1),
  phoneNumberId: z.string().nullish(),
  phoneNumber: z.looseObject({ number: z.string() }).nullish(),
  customer: z.looseObject({ number: z.string().nullish(), name: z.string().nullish() }).nullish(),
  duration: z.number().nullish(),
  endedReason: z.string().nullish(),
});
export type CallContext = z.infer<typeof CallContextSchema>;

const PhoneNumberSchema = z.looseObject({ id: z.string().nullish(), number: z.string().nullish() });

const BaseMessage = {
  call: CallContextSchema,
  phoneNumber: PhoneNumberSchema.nullish(),
  customer: z.looseObject({ number: z.string().nullish() }).nullish(),
};

export const AssistantRequestSchema = z.looseObject({
  type: z.literal("assistant-request"),
  ...BaseMessage,
});

const ToolCallSchema = z.looseObject({
  id: z.string(),
  type: z.string().optional(),
  function: z
    .looseObject({
      name: z.string(),
      arguments: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
    })
    .optional(),
  // Older flat format.
  name: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolCallsSchema = z.looseObject({
  type: z.literal("tool-calls"),
  ...BaseMessage,
  toolCallList: z.array(ToolCallSchema).default([]),
});

/** Legacy `function-call` message, still sent by assistants using `functions`. */
export const FunctionCallSchema = z.looseObject({
  type: z.literal("function-call"),
  ...BaseMessage,
  functionCall: z.looseObject({
    name: z.string(),
    parameters: z.union([z.record(z.string(), z.unknown()), z.string()]).default({}),
  }),
});

export const EndOfCallReportSchema = z.looseObject({
  type: z.literal("end-of-call-report"),
  ...BaseMessage,
  endedReason: z.string().nullish(),
  durationSeconds: z.number().nullish(),
  cost: z.number().nullish(),
  summary: z.string().nullish(),
  transcript: z.string().nullish(),
  recordingUrl: z.string().nullish(),
  analysis: z.looseObject({ summary: z.string().nullish() }).nullish(),
  artifact: z
    .looseObject({
      transcript: z.string().nullish(),
      recordingUrl: z.string().nullish(),
      recording: z
        .looseObject({
          mono: z.looseObject({ combinedUrl: z.string().nullish() }).nullish(),
          stereoUrl: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
export type EndOfCallReport = z.infer<typeof EndOfCallReportSchema>;

const EnvelopeSchema = z.looseObject({ type: z.string() });

/** Vapi wraps messages as `{ message: {...} }`; accept the bare form too. */
export function extractMessage(body: unknown): z.infer<typeof EnvelopeSchema> | null {
  if (body && typeof body === "object" && "message" in body) {
    const wrapped = EnvelopeSchema.safeParse((body as { message: unknown }).message);
    if (wrapped.success) return wrapped.data;
  }
  const bare = EnvelopeSchema.safeParse(body);
  return bare.success ? bare.data : null;
}

/** Normalize the fields that moved around between Vapi versions. */
export function readEndOfCallReport(report: EndOfCallReport) {
  const transcript = report.artifact?.transcript ?? report.transcript ?? "";
  const recordingUrl =
    report.artifact?.recordingUrl ??
    report.artifact?.recording?.mono?.combinedUrl ??
    report.artifact?.recording?.stereoUrl ??
    report.recordingUrl ??
    null;
  return {
    transcript,
    recordingUrl,
    summary: report.analysis?.summary ?? report.summary ?? null,
    endedReason: report.endedReason ?? report.call.endedReason ?? null,
    durationSeconds: Math.round(report.durationSeconds ?? report.call.duration ?? 0),
    costCents: typeof report.cost === "number" ? Math.round(report.cost * 100) : null,
    callerNumber: report.customer?.number ?? report.call.customer?.number ?? null,
  };
}

/** Dialed number and phone id, from either the message or the call object. */
export function dialedNumber(message: {
  call: CallContext;
  phoneNumber?: { id?: string | null; number?: string | null } | null;
}) {
  return {
    number: message.phoneNumber?.number ?? message.call.phoneNumber?.number ?? null,
    phoneId: message.phoneNumber?.id ?? message.call.phoneNumberId ?? null,
  };
}

export function parseToolArguments(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}
