import { formatPhoneForDisplay } from "./phone";
import { formatShortDateTime } from "./time";
import type { CallOutcome } from "./types";

/** Owner-facing post-call digest. Rendered as SMS text and as HTML email. */
export interface CallDigest {
  businessName: string;
  timeZone: string;
  callerNumber: string | null;
  callerName: string | null;
  durationSeconds: number;
  outcome: CallOutcome;
  summary: string | null;
  transferFailed: boolean;
  followUpReason: string | null;
  appointments: Array<{ caller_name: string; start_time: string; reason: string | null }>;
  messages: Array<{ caller_name: string; content: string; urgency: string }>;
  dashboardUrl: string | null;
}

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  appointment_booked: "Appointment booked",
  message_taken: "Message taken",
  transferred: "Transferred to you",
  faq_answered: "Question answered",
  missed: "Missed call",
  other: "Call handled",
};

export function outcomeLabel(outcome: CallOutcome): string {
  return OUTCOME_LABELS[outcome];
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function callerLabel(digest: CallDigest): string {
  const number = formatPhoneForDisplay(digest.callerNumber);
  return digest.callerName ? `${digest.callerName} ${number}` : number;
}

/**
 * Plain-text SMS. Kept short: two segments (~300 chars) is the practical
 * ceiling before carriers start splitting messages unpredictably.
 */
export function renderDigestSms(digest: CallDigest): string {
  const mins = Math.max(1, Math.ceil(digest.durationSeconds / 60));
  const lines = [
    `[VoiceDesk] ${outcomeLabel(digest.outcome)} · ${digest.businessName}`,
    `From: ${callerLabel(digest)} (${mins} min)`,
  ];

  if (digest.transferFailed) {
    lines.push("Transfer to you failed. Please call them back.");
  } else if (digest.followUpReason) {
    lines.push(`Follow up: ${truncate(digest.followUpReason, 90)}`);
  }

  for (const appt of digest.appointments) {
    const when = formatShortDateTime(new Date(appt.start_time), digest.timeZone);
    lines.push(`Booked: ${appt.caller_name}, ${when}${appt.reason ? ` (${truncate(appt.reason, 40)})` : ""}`);
  }

  for (const msg of digest.messages) {
    const flag = msg.urgency === "high" ? "URGENT " : "";
    lines.push(`${flag}Msg: "${truncate(msg.content, 80)}"`);
  }

  if (digest.summary && digest.appointments.length === 0 && digest.messages.length === 0) {
    lines.push(`Summary: ${truncate(digest.summary, 120)}`);
  }

  return lines.join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML email. Every interpolated value is caller-controlled (names, message
 * text, transcripts), so everything goes through `escapeHtml`.
 */
export function renderDigestEmail(digest: CallDigest): { subject: string; html: string } {
  const e = escapeHtml;
  const subject = `${outcomeLabel(digest.outcome)}: ${callerLabel(digest)}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap">${e(label)}</td><td style="padding:4px 0;color:#0f172a">${value}</td></tr>`;

  const rows = [
    row("Caller", e(callerLabel(digest))),
    row("Duration", e(`${Math.max(1, Math.ceil(digest.durationSeconds / 60))} min`)),
    row("Outcome", e(outcomeLabel(digest.outcome))),
  ];
  if (digest.summary) rows.push(row("Summary", e(digest.summary)));
  for (const appt of digest.appointments) {
    const when = formatShortDateTime(new Date(appt.start_time), digest.timeZone);
    rows.push(row("Appointment", e(`${appt.caller_name}, ${when}${appt.reason ? ` (${appt.reason})` : ""}`)));
  }
  for (const msg of digest.messages) {
    rows.push(row(msg.urgency === "high" ? "Urgent message" : "Message", e(msg.content)));
  }

  const banner = digest.transferFailed
    ? `<p style="margin:0 0 16px;padding:12px;border-radius:8px;background:#fef2f2;color:#991b1b">The caller asked for you and the live transfer failed. Please call them back.</p>`
    : digest.followUpReason
      ? `<p style="margin:0 0 16px;padding:12px;border-radius:8px;background:#fffbeb;color:#92400e">Follow-up needed: ${e(digest.followUpReason)}</p>`
      : "";

  const cta = digest.dashboardUrl
    ? `<p style="margin:20px 0 0"><a href="${e(digest.dashboardUrl)}" style="color:#4f46e5">Open the call in your dashboard</a></p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,system-ui,sans-serif;font-size:14px"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px"><p style="margin:0 0 4px;color:#4f46e5;font-weight:600">${e(digest.businessName)}</p><h1 style="margin:0 0 16px;font-size:18px;color:#0f172a">${e(outcomeLabel(digest.outcome))}</h1>${banner}<table style="border-collapse:collapse">${rows.join("")}</table>${cta}</div></body></html>`;

  return { subject, html };
}
