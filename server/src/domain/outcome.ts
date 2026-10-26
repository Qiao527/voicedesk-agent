import type { CallOutcome } from "./types";

/**
 * Vapi reports live transfers with several provider-specific `endedReason`
 * strings ("assistant-forwarded-call", "twilio-forwarded-call", ...). A failed
 * forward shows up as "...-forwarding-call-failed".
 */
export function classifyTransfer(endedReason: string | null | undefined) {
  const reason = endedReason ?? "";
  const failed = /forwarding-call-failed|transfer-failed/i.test(reason);
  const succeeded = !failed && /forwarded-call|transfer/i.test(reason);
  return { failed, succeeded };
}

/** Calls that ended before anyone (human or AI) could talk to the caller. */
export function isMissedCall(params: {
  durationSeconds: number;
  transcript: string | null | undefined;
  endedReason: string | null | undefined;
}): boolean {
  const silent = !params.transcript || params.transcript.trim().length === 0;
  return (
    silent &&
    (params.durationSeconds < 5 ||
      /customer-did-not-answer|customer-busy|silence-timed-out/i.test(params.endedReason ?? ""))
  );
}

/**
 * Outcome precedence: concrete artifacts (appointment, message) beat a
 * transfer, which beats "answered a question". The analyzer can later upgrade
 * "other" to "faq_answered", but never downgrade a booking.
 */
export function deriveOutcome(params: {
  appointmentCount: number;
  messageCount: number;
  endedReason: string | null | undefined;
  durationSeconds: number;
  transcript: string | null | undefined;
}): CallOutcome {
  if (params.appointmentCount > 0) return "appointment_booked";
  if (params.messageCount > 0) return "message_taken";
  if (classifyTransfer(params.endedReason).succeeded) return "transferred";
  if (isMissedCall(params)) return "missed";
  return "other";
}

export function refineOutcomeWithAnalysis(
  current: CallOutcome,
  analysis: { questions_answered: boolean } | null,
): CallOutcome {
  if (current === "other" && analysis?.questions_answered) return "faq_answered";
  return current;
}
