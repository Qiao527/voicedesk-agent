import { renderDigestEmail, renderDigestSms, type CallDigest } from "../domain/notifications";
import { classifyTransfer, deriveOutcome, refineOutcomeWithAnalysis } from "../domain/outcome";
import { normalizeE164 } from "../domain/phone";
import type { Business, CallAnalysis, CallRecord } from "../domain/types";
import { serializeError } from "../lib/logger";
import { resolveBusiness, type PipelineDeps } from "./context";
import { readEndOfCallReport, type EndOfCallReport } from "./schemas";

/**
 * Persist the call synchronously (so a DB failure makes Vapi retry), then
 * analyze and notify in the background. Every step is idempotent on the Vapi
 * call id, so retries never duplicate rows or SMS.
 */
export async function handleEndOfCallReport(
  deps: PipelineDeps,
  report: EndOfCallReport,
): Promise<CallRecord> {
  const business = await resolveBusiness(deps, report);
  const data = readEndOfCallReport(report);
  const vapiCallId = report.call.id;

  const [appointments, messages] = await Promise.all([
    deps.repo.listAppointmentsForVapiCall(vapiCallId),
    deps.repo.listMessagesForVapiCall(vapiCallId),
  ]);

  const outcome = deriveOutcome({
    appointmentCount: appointments.length,
    messageCount: messages.length,
    endedReason: data.endedReason,
    durationSeconds: data.durationSeconds,
    transcript: data.transcript,
  });

  const call = await deps.repo.upsertCall({
    business_id: business?.id ?? null,
    vapi_call_id: vapiCallId,
    caller_number: data.callerNumber,
    direction: "inbound",
    status: outcome === "missed" ? "missed" : "completed",
    duration_seconds: data.durationSeconds,
    summary: data.summary,
    transcript: data.transcript,
    recording_url: data.recordingUrl,
    ended_reason: data.endedReason,
    outcome,
    cost_cents: data.costCents,
  });
  await deps.repo.linkCallArtifacts(vapiCallId, call.id);

  deps.logger.info("call.recorded", {
    callId: call.id,
    businessId: business?.id ?? null,
    outcome,
    durationSeconds: data.durationSeconds,
  });

  if (business) {
    deps.background("call.post_process", () =>
      postProcess(deps, { business, call, appointments, messages, endedReason: data.endedReason }),
    );
  }
  return call;
}

async function postProcess(
  deps: PipelineDeps,
  ctx: {
    business: Business;
    call: CallRecord;
    appointments: Awaited<ReturnType<PipelineDeps["repo"]["listAppointmentsForVapiCall"]>>;
    messages: Awaited<ReturnType<PipelineDeps["repo"]["listMessagesForVapiCall"]>>;
    endedReason: string | null;
  },
) {
  const { business, call, appointments, messages } = ctx;
  const transfer = classifyTransfer(ctx.endedReason);
  const log = deps.logger.child({ callId: call.id, businessId: business.id });

  // 1. Structured analysis (best effort).
  let analysis: CallAnalysis | null = null;
  if (deps.analyzer && call.transcript) {
    analysis = await deps.analyzer.analyze({
      businessName: business.name,
      transcript: call.transcript,
      facts: {
        appointmentsBooked: appointments.length,
        messagesTaken: messages.length,
        transferred: transfer.succeeded,
      },
    });
  }

  const urgentMessage = messages.some((m) => m.urgency === "high");
  const followUp =
    transfer.failed || urgentMessage || call.outcome === "missed" || Boolean(analysis?.follow_up_required);
  const followUpReason = transfer.failed
    ? "Live transfer failed; call the customer back"
    : urgentMessage
      ? "Urgent message left"
      : call.outcome === "missed"
        ? "Missed call; call back"
        : (analysis?.follow_up_reason ?? null);
  const outcome = refineOutcomeWithAnalysis(call.outcome ?? "other", analysis);
  const summary = analysis?.summary ?? call.summary;
  const callerName =
    analysis?.caller_name ?? appointments[0]?.caller_name ?? messages[0]?.caller_name ?? null;

  try {
    await deps.repo.saveCallAnalysis(call.id, {
      analysis,
      sentiment: analysis?.sentiment ?? null,
      caller_name: callerName,
      follow_up_required: followUp,
      summary,
      outcome,
    });
  } catch (err) {
    log.error("call.analysis_save_failed", serializeError(err));
  }

  // 2. Owner digest, at most once per call.
  const claimed = await deps.repo.claimOwnerNotification(call.id, deps.now().toISOString());
  if (!claimed) {
    log.info("call.notify_skipped", { reason: "already_notified" });
    return;
  }

  const digest: CallDigest = {
    businessName: business.name,
    timeZone: business.timezone,
    callerNumber: call.caller_number,
    callerName,
    durationSeconds: call.duration_seconds,
    outcome,
    summary,
    transferFailed: transfer.failed,
    followUpReason: followUp ? followUpReason : null,
    appointments,
    messages,
    dashboardUrl: deps.dashboardUrl ? `${deps.dashboardUrl}/calls?call=${call.id}` : null,
  };

  const smsTo = normalizeE164(business.owner_phone);
  const sends: Promise<boolean>[] = [];
  if (smsTo) sends.push(deps.notifier.sendSms(smsTo, renderDigestSms(digest)));
  if (business.owner_email) {
    sends.push(deps.notifier.sendEmail({ to: business.owner_email, ...renderDigestEmail(digest) }));
  }
  await Promise.all(sends);
}
