import { describe, expect, it } from "vitest";
import { buildAvailableSlots, checkRequestedSlot, pickSpokenSlots } from "../../src/domain/scheduling";

const at = (iso: string) => new Date(iso);
const window = { start: at("2026-10-21T13:00:00Z"), end: at("2026-10-21T17:00:00Z") }; // 9:00-13:00 EDT
const longAgo = at("2026-01-01T00:00:00Z");

describe("buildAvailableSlots", () => {
  it("fills the window on a 30-minute grid", () => {
    const slots = buildAvailableSlots({ window, busy: [], now: longAgo, durationMinutes: 30 });
    expect(slots).toHaveLength(8);
    expect(slots[0].start.toISOString()).toBe("2026-10-21T13:00:00.000Z");
    expect(slots.at(-1)!.start.toISOString()).toBe("2026-10-21T16:30:00.000Z");
  });

  it("skips slots that overlap busy blocks, including partial overlaps", () => {
    const busy = [{ start: at("2026-10-21T14:15:00Z"), end: at("2026-10-21T15:00:00Z") }];
    const starts = buildAvailableSlots({ window, busy, now: longAgo, durationMinutes: 30 }).map((s) =>
      s.start.toISOString().slice(11, 16),
    );
    expect(starts).toEqual(["13:00", "13:30", "15:00", "15:30", "16:00", "16:30"]);
  });

  it("never offers a slot that would run past closing", () => {
    const slots = buildAvailableSlots({ window, busy: [], now: longAgo, durationMinutes: 60 });
    expect(slots.at(-1)!.end.toISOString()).toBe("2026-10-21T17:00:00.000Z");
  });

  it("respects the minimum lead time", () => {
    const now = at("2026-10-21T13:10:00Z");
    const slots = buildAvailableSlots({ window, busy: [], now, durationMinutes: 30, minLeadMinutes: 60 });
    expect(slots[0].start.toISOString()).toBe("2026-10-21T14:30:00.000Z");
  });
});

describe("pickSpokenSlots", () => {
  it("returns short lists unchanged and spreads long ones", () => {
    expect(pickSpokenSlots([1, 2, 3])).toEqual([1, 2, 3]);
    expect(pickSpokenSlots([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([1, 5, 9]);
  });
});

describe("checkRequestedSlot", () => {
  const slot = { start: at("2026-10-21T14:00:00Z"), end: at("2026-10-21T14:30:00Z") };

  it("accepts a free slot inside hours", () => {
    expect(checkRequestedSlot({ slot, window, busy: [], now: longAgo })).toEqual({ ok: true });
  });

  it("reports why a slot is rejected", () => {
    expect(checkRequestedSlot({ slot, window: null, busy: [], now: longAgo })).toEqual({
      ok: false,
      reason: "outside_hours",
    });
    expect(checkRequestedSlot({ slot, window, busy: [slot], now: longAgo })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(checkRequestedSlot({ slot, window, busy: [], now: at("2026-10-21T13:30:00Z") })).toEqual({
      ok: false,
      reason: "too_soon",
    });
  });
});
