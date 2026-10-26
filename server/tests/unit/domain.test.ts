import { describe, expect, it } from "vitest";
import { summarizeCalls } from "../../src/domain/analytics";
import {
  escapeHtml,
  renderDigestEmail,
  renderDigestSms,
  type CallDigest,
} from "../../src/domain/notifications";
import { classifyTransfer, deriveOutcome, refineOutcomeWithAnalysis } from "../../src/domain/outcome";
import { formatPhoneForDisplay, maskPhone, normalizeE164 } from "../../src/domain/phone";

describe("phone", () => {
  it.each([
    ["(617) 555-1234", "+16175551234"],
    ["617.555.1234", "+16175551234"],
    ["1-617-555-1234", "+16175551234"],
    ["+44 20 7946 0958", "+442079460958"],
    ["555-1234", null],
    ["+0123456789", null],
    ["", null],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeE164(input)).toBe(expected);
  });

  it("masks and formats", () => {
    expect(maskPhone("+16175551234")).toBe("+*******1234");
    expect(maskPhone(null)).toBe("[none]");
    expect(formatPhoneForDisplay("+16175551234")).toBe("(617) 555-1234");
    expect(formatPhoneForDisplay("+442079460958")).toBe("+442079460958");
  });
});

describe("outcome", () => {
  const base = {
    appointmentCount: 0,
    messageCount: 0,
    endedReason: "customer-ended-call",
    durationSeconds: 60,
    transcript: "AI: hi",
  };

  it("prefers concrete artifacts over transfers", () => {
    expect(deriveOutcome({ ...base, appointmentCount: 1, endedReason: "assistant-forwarded-call" })).toBe(
      "appointment_booked",
    );
    expect(deriveOutcome({ ...base, messageCount: 2 })).toBe("message_taken");
    expect(deriveOutcome({ ...base, endedReason: "assistant-forwarded-call" })).toBe("transferred");
    expect(deriveOutcome(base)).toBe("other");
  });

  it("detects missed calls", () => {
    expect(deriveOutcome({ ...base, durationSeconds: 2, transcript: "" })).toBe("missed");
  });

  it("treats failed forwards as failures, not transfers", () => {
    expect(classifyTransfer("pipeline-error-forwarding-call-failed")).toEqual({
      failed: true,
      succeeded: false,
    });
    expect(classifyTransfer("twilio-forwarded-call")).toEqual({ failed: false, succeeded: true });
  });

  it("only upgrades 'other' using the analysis", () => {
    expect(refineOutcomeWithAnalysis("other", { questions_answered: true })).toBe("faq_answered");
    expect(refineOutcomeWithAnalysis("appointment_booked", { questions_answered: true })).toBe(
      "appointment_booked",
    );
  });
});

describe("notifications", () => {
  const digest: CallDigest = {
    businessName: "Harborview Dental",
    timeZone: "America/New_York",
    callerNumber: "+16175550199",
    callerName: "Jordan <script>",
    durationSeconds: 95,
    outcome: "appointment_booked",
    summary: "Booked a cleaning.",
    transferFailed: false,
    followUpReason: null,
    appointments: [{ caller_name: "Jordan", start_time: "2026-10-21T14:00:00Z", reason: "Cleaning" }],
    messages: [],
    dashboardUrl: "https://app.example.com/calls?call=1",
  };

  it("formats appointment times in the business zone, not server time", () => {
    const sms = renderDigestSms(digest);
    expect(sms).toContain("Booked: Jordan, Wed, Oct 21, 10:00 AM (Cleaning)");
    expect(sms).toContain("(617) 555-0199 (2 min)");
  });

  it("puts failed transfers first", () => {
    expect(renderDigestSms({ ...digest, transferFailed: true }).split("\n")[2]).toMatch(
      /Transfer to you failed/,
    );
  });

  it("escapes caller-controlled content in email", () => {
    const { html, subject } = renderDigestEmail(digest);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Jordan &lt;script&gt;");
    expect(subject).toContain("Appointment booked");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });
});

describe("summarizeCalls", () => {
  it("aggregates outcomes, cost, after-hours and local-day buckets", () => {
    const now = new Date("2026-10-21T16:00:00Z");
    const summary = summarizeCalls({
      now,
      periodDays: 3,
      timeZone: "America/New_York",
      businessHours: { mon: "9:00-17:00", tue: "9:00-17:00", wed: "9:00-17:00" },
      calls: [
        {
          created_at: "2026-10-21T14:00:00Z",
          duration_seconds: 120,
          outcome: "appointment_booked",
          sentiment: "positive",
          cost_cents: 20,
          follow_up_required: false,
        },
        {
          created_at: "2026-10-21T01:00:00Z",
          duration_seconds: 60,
          outcome: "faq_answered",
          sentiment: "neutral",
          cost_cents: 10,
          follow_up_required: false,
        },
        {
          created_at: "2026-10-20T15:00:00Z",
          duration_seconds: 0,
          outcome: "missed",
          sentiment: null,
          cost_cents: null,
          follow_up_required: true,
        },
      ],
    });

    expect(summary.totalCalls).toBe(3);
    expect(summary.answeredCalls).toBe(2);
    expect(summary.resolutionRate).toBe(1);
    expect(summary.totalCostCents).toBe(30);
    expect(summary.afterHoursCalls).toBe(1); // 21:00 Boston time
    expect(summary.followUpsOpen).toBe(1);
    expect(summary.outcomes.appointment_booked).toBe(1);
    // The 01:00Z call belongs to Oct 20 in Boston.
    expect(summary.daily).toEqual([
      { date: "2026-10-19", calls: 0, booked: 0 },
      { date: "2026-10-20", calls: 2, booked: 0 },
      { date: "2026-10-21", calls: 1, booked: 1 },
    ]);
  });
});
