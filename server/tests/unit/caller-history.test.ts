import { describe, expect, it } from "vitest";
import {
  buildCallerHistory,
  phoneMatchCandidates,
  type CallerHistoryAppointment,
  type CallerHistoryCall,
} from "../../src/domain/caller-history";

const NOW = new Date("2026-10-20T14:00:00.000Z");

const call = (overrides: Partial<CallerHistoryCall> = {}): CallerHistoryCall => ({
  caller_number: "+16175550199",
  caller_name: null,
  outcome: "faq_answered",
  created_at: "2026-10-01T10:00:00.000Z",
  ...overrides,
});

const appt = (overrides: Partial<CallerHistoryAppointment> = {}): CallerHistoryAppointment => ({
  caller_name: "Jordan Lee",
  caller_phone: "+16175550199",
  reason: "Cleaning",
  start_time: "2026-10-11T14:00:00.000Z",
  status: "completed",
  ...overrides,
});

describe("buildCallerHistory", () => {
  it("returns null when the number is new to the business", () => {
    expect(buildCallerHistory("+16175550199", [], [], NOW)).toBeNull();
    expect(
      buildCallerHistory("+16175550199", [call({ caller_number: "+16175550000" })], [], NOW),
    ).toBeNull();
  });

  it("counts calls and takes the name and outcome from the most recent one", () => {
    const history = buildCallerHistory(
      "+16175550199",
      [
        call({ created_at: "2026-10-01T10:00:00.000Z", caller_name: null, outcome: "missed" }),
        call({ created_at: "2026-10-10T10:00:00.000Z", caller_name: "Jordan Lee", outcome: "appointment_booked" }),
      ],
      [],
      NOW,
    );
    expect(history).toMatchObject({
      caller_number: "+16175550199",
      caller_name: "Jordan Lee",
      call_count: 2,
      last_call_at: "2026-10-10T10:00:00.000Z",
      last_outcome: "appointment_booked",
    });
  });

  it("matches the same line across number formats", () => {
    const history = buildCallerHistory(
      "(617) 555-0199",
      [call({ caller_number: "+16175550199", caller_name: "Jordan Lee" })],
      [appt({ caller_phone: "1-617-555-0199" })],
      NOW,
    );
    expect(history?.call_count).toBe(1);
    expect(history?.last_visit?.reason).toBe("Cleaning");
  });

  it("separates an upcoming confirmed appointment from the last past visit", () => {
    const history = buildCallerHistory(
      "+16175550199",
      [call()],
      [
        appt({ start_time: "2026-09-02T14:00:00.000Z", status: "completed", reason: "Exam" }),
        appt({ start_time: "2026-10-25T14:00:00.000Z", status: "confirmed", reason: "Checkup" }),
        appt({ start_time: "2026-11-01T14:00:00.000Z", status: "cancelled", reason: "Whitening" }),
      ],
      NOW,
    );
    expect(history?.upcoming_appointment).toMatchObject({ reason: "Checkup", status: "confirmed" });
    expect(history?.last_visit).toMatchObject({ reason: "Exam", status: "completed" });
  });

  it("recognizes a caller known only from a booked appointment", () => {
    const history = buildCallerHistory(
      "+16175550199",
      [],
      [appt({ start_time: "2026-10-28T14:00:00.000Z", status: "confirmed", reason: "Cleaning" })],
      NOW,
    );
    expect(history).toMatchObject({
      caller_name: "Jordan Lee",
      call_count: 0,
      last_call_at: null,
    });
    expect(history?.upcoming_appointment?.reason).toBe("Cleaning");
  });
});

describe("phoneMatchCandidates", () => {
  it("includes the raw and E.164 forms without duplicates", () => {
    expect(phoneMatchCandidates("(617) 555-0199").sort()).toEqual(["(617) 555-0199", "+16175550199"]);
    expect(phoneMatchCandidates("+16175550199")).toEqual(["+16175550199"]);
  });
});
