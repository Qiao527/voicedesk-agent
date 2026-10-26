import { describe, expect, it } from "vitest";
import { DEMO_FAQS, demoBusiness } from "../../src/demo/fixtures";
import { buildAssistant, buildFirstMessage, buildSystemPrompt } from "../../src/vapi/assistant";
import {
  EndOfCallReportSchema,
  extractMessage,
  parseToolArguments,
  readEndOfCallReport,
} from "../../src/vapi/schemas";

const voice = { model: "claude-haiku-5-5", voiceProvider: "vapi", voiceId: "Clara" };
const now = new Date("2026-10-20T14:00:00Z");

describe("buildAssistant", () => {
  it("adds a transfer tool only when the owner phone is dialable", () => {
    const withPhone = buildAssistant(demoBusiness(), DEMO_FAQS, voice, now);
    expect(withPhone.model.tools.some((t) => (t as { type: string }).type === "transferCall")).toBe(true);

    const noPhone = buildAssistant(demoBusiness({ owner_phone: "555-1234" }), DEMO_FAQS, voice, now);
    expect(noPhone.model.tools.some((t) => (t as { type: string }).type === "transferCall")).toBe(false);
    expect(noPhone.model.messages[0].content).toMatch(/Live transfer is not available/);
  });

  it("puts the disclosure before the greeting", () => {
    expect(buildFirstMessage(demoBusiness())).toMatch(
      /^This call may be recorded.*Thanks for calling Harborview Dental/,
    );
    expect(buildFirstMessage(demoBusiness({ recording_disclosure: null, greeting_message: null }))).toBe(
      "Thanks for calling Harborview Dental, how can I help you today?",
    );
  });

  it("grounds the prompt in today's date, hours and FAQ", () => {
    const prompt = buildSystemPrompt(demoBusiness(), DEMO_FAQS, now);
    expect(prompt).toContain("Today is Tuesday, October 20, 2026");
    expect(prompt).toContain("Thu 8:00-19:00");
    expect(prompt).toContain("Delta Dental");
    expect(prompt).toContain("Do not give medical, legal, or financial advice");
  });

  it("keeps guardrails when the owner overrides the prompt", () => {
    const prompt = buildSystemPrompt(
      demoBusiness({ system_prompt_override: "Talk like a pirate." }),
      [],
      now,
    );
    expect(prompt).toContain("Talk like a pirate.");
    expect(prompt).toContain("Do not invent availability");
  });
});

describe("schemas", () => {
  it("unwraps the Vapi envelope", () => {
    expect(extractMessage({ message: { type: "status-update" } })?.type).toBe("status-update");
    expect(extractMessage({ type: "hang" })?.type).toBe("hang");
    expect(extractMessage("nope")).toBeNull();
  });

  it("reads end-of-call fields from both payload generations", () => {
    const legacy = EndOfCallReportSchema.parse({
      type: "end-of-call-report",
      call: { id: "c1", duration: 61.6, endedReason: "customer-ended-call", customer: { number: "+1617" } },
      transcript: "AI: hi",
      recordingUrl: "https://r/1.wav",
      summary: "old summary",
      cost: 0.137,
    });
    expect(readEndOfCallReport(legacy)).toMatchObject({
      transcript: "AI: hi",
      recordingUrl: "https://r/1.wav",
      durationSeconds: 62,
      costCents: 14,
      endedReason: "customer-ended-call",
    });

    const current = EndOfCallReportSchema.parse({
      type: "end-of-call-report",
      call: { id: "c1" },
      endedReason: "assistant-ended-call",
      durationSeconds: 30,
      analysis: { summary: "new summary" },
      artifact: { transcript: "AI: hello", recording: { mono: { combinedUrl: "https://r/2.wav" } } },
    });
    expect(readEndOfCallReport(current)).toMatchObject({
      transcript: "AI: hello",
      recordingUrl: "https://r/2.wav",
      summary: "new summary",
      durationSeconds: 30,
    });
  });

  it("parses tool arguments defensively", () => {
    expect(parseToolArguments('{"date":"2026-10-21"}')).toEqual({ date: "2026-10-21" });
    expect(parseToolArguments({ a: 1 })).toEqual({ a: 1 });
    expect(parseToolArguments("")).toEqual({});
    expect(parseToolArguments("{oops")).toBeNull();
    expect(parseToolArguments("[1,2]")).toBeNull();
  });
});
