import { describe, expect, it } from "vitest";
import {
  businessDayWindow,
  describeBusinessHours,
  isValidDateString,
  isValidTimeZone,
  isWithinBusinessHours,
  localDateKey,
  parseDateTimeInZone,
  parseHoursRange,
  resolveDayHours,
  weekdayOf,
  zonedTimeToUtc,
} from "../../src/domain/time";

const NY = "America/New_York";

describe("zonedTimeToUtc", () => {
  it("handles standard and daylight time in New York", () => {
    expect(zonedTimeToUtc({ year: 2026, month: 1, day: 15 }, { hour: 9, minute: 0 }, NY).toISOString()).toBe(
      "2026-01-15T14:00:00.000Z",
    );
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 15 }, { hour: 9, minute: 0 }, NY).toISOString()).toBe(
      "2026-07-15T13:00:00.000Z",
    );
  });

  it("resolves both sides of the DST transitions", () => {
    // 2026-03-08: clocks jump 02:00 -> 03:00. 01:30 is EST, 03:30 is EDT.
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 8 }, { hour: 1, minute: 30 }, NY).toISOString()).toBe(
      "2026-03-08T06:30:00.000Z",
    );
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 8 }, { hour: 3, minute: 30 }, NY).toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
    // 2026-11-01: fall back. 09:00 is EST again.
    expect(zonedTimeToUtc({ year: 2026, month: 11, day: 1 }, { hour: 9, minute: 0 }, NY).toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
  });

  it("supports half-hour offsets", () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 4, day: 2 }, { hour: 9, minute: 0 }, "Asia/Kolkata").toISOString(),
    ).toBe("2026-04-02T03:30:00.000Z");
  });

  it("supports zones ahead of UTC by more than 12 hours", () => {
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 4, day: 2 },
        { hour: 9, minute: 0 },
        "Pacific/Kiritimati",
      ).toISOString(),
    ).toBe("2026-04-01T19:00:00.000Z");
  });
});

describe("parseDateTimeInZone", () => {
  it("interprets naive wall-clock times in the business zone", () => {
    expect(parseDateTimeInZone("2026-04-17T14:00:00", NY)?.toISOString()).toBe("2026-04-17T18:00:00.000Z");
    expect(parseDateTimeInZone("2026-04-17 14:00", NY)?.toISOString()).toBe("2026-04-17T18:00:00.000Z");
  });

  it("trusts explicit offsets", () => {
    expect(parseDateTimeInZone("2026-04-17T14:00:00Z", NY)?.toISOString()).toBe("2026-04-17T14:00:00.000Z");
    expect(parseDateTimeInZone("2026-04-17T14:00:00-04:00", NY)?.toISOString()).toBe(
      "2026-04-17T18:00:00.000Z",
    );
  });

  it("rejects garbage and impossible dates instead of returning Invalid Date", () => {
    expect(parseDateTimeInZone("next tuesday at 2", NY)).toBeNull();
    expect(parseDateTimeInZone("2026-02-30T10:00:00", NY)).toBeNull();
    expect(parseDateTimeInZone("2026-04-17T25:00:00", NY)).toBeNull();
  });
});

describe("calendar dates", () => {
  it("computes weekdays independent of zone", () => {
    expect(weekdayOf("2026-10-20")).toBe("tue");
    expect(weekdayOf("2026-10-25")).toBe("sun");
  });

  it("validates dates strictly", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("26-2-1")).toBe(false);
  });

  it("buckets an instant into the local calendar day", () => {
    // 01:30 UTC on the 21st is 21:30 on the 20th in Boston.
    expect(localDateKey(new Date("2026-10-21T01:30:00Z"), NY)).toBe("2026-10-20");
  });

  it("validates time zones", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("business hours", () => {
  const hours = { mon: "9:00-17:00", tue: "9:00-17:00", fri: "8:30-24:00", sat: "closed" };

  it("parses ranges and rejects bad ones", () => {
    expect(parseHoursRange("9:00-17:00")).toEqual({
      open: { hour: 9, minute: 0 },
      close: { hour: 17, minute: 0 },
    });
    expect(parseHoursRange("17:00-9:00")).toBeNull();
    expect(parseHoursRange("9-5")).toBeNull();
    expect(parseHoursRange("closed")).toBeNull();
  });

  it("treats missing and closed days as closed", () => {
    expect(resolveDayHours("2026-10-19", hours)).not.toBeNull(); // Monday
    expect(resolveDayHours("2026-10-24", hours)).toBeNull(); // Saturday, closed
    expect(resolveDayHours("2026-10-25", hours)).toBeNull(); // Sunday, missing
    expect(resolveDayHours("2026-10-19", null)).toBeNull();
  });

  it("builds a UTC window, including a 24:00 close", () => {
    const fri = resolveDayHours("2026-10-23", hours)!;
    const window = businessDayWindow("2026-10-23", fri, NY);
    expect(window.start.toISOString()).toBe("2026-10-23T12:30:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-24T04:00:00.000Z");
  });

  it("detects after-hours instants", () => {
    expect(isWithinBusinessHours(new Date("2026-10-19T14:00:00Z"), hours, NY)).toBe(true); // Mon 10:00
    expect(isWithinBusinessHours(new Date("2026-10-19T22:30:00Z"), hours, NY)).toBe(false); // Mon 18:30
    expect(isWithinBusinessHours(new Date("2026-10-24T15:00:00Z"), hours, NY)).toBe(false); // Sat
  });

  it("describes hours for the system prompt", () => {
    expect(describeBusinessHours(hours)).toBe(
      "Mon 9:00-17:00; Tue 9:00-17:00; Wed closed; Thu closed; Fri 8:30-24:00; Sat closed; Sun closed",
    );
  });
});
