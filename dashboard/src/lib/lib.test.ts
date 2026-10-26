import { describe, expect, it } from "vitest";
import { generateDemoData, DEMO_BUSINESS } from "./demo-data";
import { createDemoApi, summarize } from "./demo-api";
import { formatDuration, formatPhone, formatRelative, initials } from "./format";
import { isWithinHours, localDateKey, parseRange } from "./time";
import { parseTranscript } from "./transcript";

describe("parseTranscript", () => {
  it("splits Vapi transcripts into turns and merges consecutive lines", () => {
    expect(parseTranscript("AI: Hello\nUser: Hi there\nUser: I need help\nAssistant: Sure")).toEqual([
      { speaker: "ai", text: "Hello" },
      { speaker: "caller", text: "Hi there I need help" },
      { speaker: "ai", text: "Sure" },
    ]);
  });

  it("keeps unlabeled wrapped lines with the previous turn", () => {
    expect(parseTranscript("Caller: My number is\n617 555 0199")).toEqual([{ speaker: "caller", text: "My number is 617 555 0199" }]);
  });

  it("handles empty input", () => {
    expect(parseTranscript(null)).toEqual([]);
    expect(parseTranscript("   ")).toEqual([]);
  });
});

describe("format", () => {
  it("formats durations, phones and initials", () => {
    expect(formatDuration(5)).toBe("5s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatPhone("+16175550199")).toBe("(617) 555-0199");
    expect(formatPhone(null)).toBe("Unknown number");
    expect(initials("Jordan Lee")).toBe("JL");
    expect(initials(null)).toBe("?");
  });

  it("formats relative times", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(formatRelative("2026-10-20T11:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-10-20T11:30:00Z", now)).toBe("30 minutes ago");
    expect(formatRelative("2026-10-19T12:00:00Z", now)).toBe("yesterday");
  });
});

describe("time", () => {
  it("buckets by business day and checks opening hours", () => {
    expect(localDateKey(new Date("2026-10-21T01:30:00Z"), "America/New_York")).toBe("2026-10-20");
    expect(parseRange("9:00-17:00")).toEqual({ open: 540, close: 1020 });
    expect(parseRange("17:00-9:00")).toBeNull();
    const hours = { tue: "9:00-17:00" };
    expect(isWithinHours(new Date("2026-10-20T14:00:00Z"), hours, "America/New_York")).toBe(true);
    expect(isWithinHours(new Date("2026-10-20T22:00:00Z"), hours, "America/New_York")).toBe(false);
  });
});

describe("demo data", () => {
  const now = new Date("2026-10-20T16:00:00Z");

  it("is deterministic and internally consistent", () => {
    const a = generateDemoData(now);
    const b = generateDemoData(now);
    expect(a).toEqual(b);
    expect(a.calls).toHaveLength(64);
    const ids = new Set(a.calls.map((c) => c.id));
    for (const appt of a.appointments) expect(ids.has(appt.call_id!)).toBe(true);
    for (const msg of a.messages) expect(ids.has(msg.call_id!)).toBe(true);
    expect(a.calls.filter((c) => c.follow_up_required).length).toBeGreaterThan(0);
  });

  it("summarizes like the server", () => {
    const { calls } = generateDemoData(now);
    const s = summarize(calls, now, 30, DEMO_BUSINESS.timezone, DEMO_BUSINESS.business_hours as Record<string, string>);
    expect(s.daily).toHaveLength(30);
    expect(s.daily.reduce((n, d) => n + d.calls, 0)).toBe(s.totalCalls);
    expect(Object.values(s.outcomes).reduce((n, v) => n + v, 0)).toBe(s.totalCalls);
  });

  it("persists edits for the session", async () => {
    const api = createDemoApi(now);
    await api.updateBusiness({ name: "Renamed" });
    expect((await api.getBusiness()).name).toBe("Renamed");
    const faq = await api.createFaq({ question: "Q?", answer: "A." });
    expect((await api.listFaqs()).some((f) => f.id === faq.id)).toBe(true);
  });
});
