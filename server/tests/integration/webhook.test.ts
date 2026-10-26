import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { DEMO_BUSINESS_ID } from "../../src/demo/fixtures";
import type { Appointment, CallRecord } from "../../src/domain/types";
import { createHeuristicAnalyzer } from "../../src/services/call-analyzer";
import { buildTestApp, call, SECRET, toolCall } from "../helpers/test-app";

const post = (app: ReturnType<typeof buildTestApp>["app"], message: object) =>
  request(app).post("/webhooks/vapi").set("X-Vapi-Secret", SECRET).send({ message });

describe("webhook authentication", () => {
  const body = { message: { type: "status-update", call: call() } };

  it("rejects requests without credentials", async () => {
    const { app } = buildTestApp();
    await request(app).post("/webhooks/vapi").send(body).expect(401);
    await request(app).post("/webhooks/vapi").set("X-Vapi-Secret", "wrong").send(body).expect(401);
  });

  it("accepts the shared secret, a bearer token, or an HMAC signature", async () => {
    const { app } = buildTestApp();
    await request(app).post("/webhooks/vapi").set("X-Vapi-Secret", SECRET).send(body).expect(200);
    await request(app).post("/webhooks/vapi").set("Authorization", `Bearer ${SECRET}`).send(body).expect(200);

    const raw = JSON.stringify(body);
    const sig = crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
    await request(app)
      .post("/webhooks/vapi")
      .set("Content-Type", "application/json")
      .set("X-Vapi-Signature", sig)
      .send(raw)
      .expect(200);
    await request(app)
      .post("/webhooks/vapi")
      .set("Content-Type", "application/json")
      .set("X-Vapi-Signature", "0".repeat(64))
      .send(raw)
      .expect(401);
  });
});

describe("assistant-request", () => {
  it("serves a per-business assistant", async () => {
    const { app } = buildTestApp();
    const res = await post(app, { type: "assistant-request", call: call() }).expect(200);
    const { assistant } = res.body;
    expect(assistant.firstMessage).toContain("Harborview Dental");
    expect(assistant.model.model).toBe("claude-haiku-5-5");
    expect(assistant.model.messages[0].content).toContain("Delta Dental");
    expect(assistant.model.tools.map((t: any) => t.function?.name ?? t.type)).toEqual([
      "check_availability",
      "book_appointment",
      "take_message",
      "endCall",
      "transferCall",
    ]);
  });

  it("answers unknown numbers with the fallback assistant", async () => {
    const { app } = buildTestApp();
    const res = await post(app, {
      type: "assistant-request",
      call: { id: "x", phoneNumber: { number: "+19995550000" } },
    }).expect(200);
    expect(res.body.assistant.name).toBe("VoiceDesk fallback");
  });

  it("still answers the phone when the database is down", async () => {
    const { app } = buildTestApp({
      repoOverrides: {
        findBusinessByVapiNumber: async () => {
          throw new Error("connection refused");
        },
      },
    });
    const res = await post(app, { type: "assistant-request", call: call() }).expect(200);
    expect(res.body.assistant.name).toBe("VoiceDesk fallback");
  });

  describe("returning caller", () => {
    const priorCall = (): CallRecord => ({
      id: crypto.randomUUID(),
      business_id: DEMO_BUSINESS_ID,
      vapi_call_id: crypto.randomUUID(),
      caller_number: "+16175550199",
      caller_name: "Jordan Lee",
      direction: "inbound",
      status: "completed",
      duration_seconds: 90,
      summary: null,
      transcript: null,
      recording_url: null,
      outcome: "appointment_booked",
      sentiment: "positive",
      follow_up_required: false,
      analysis: null,
      cost_cents: 20,
      ended_reason: null,
      owner_notified_at: null,
      created_at: "2026-10-05T10:00:00.000Z",
    });
    const upcomingAppt = (): Appointment => ({
      id: crypto.randomUUID(),
      business_id: DEMO_BUSINESS_ID,
      call_id: null,
      caller_name: "Jordan Lee",
      caller_phone: "+16175550199",
      service_type: "Cleaning",
      start_time: "2026-10-23T14:00:00.000Z",
      end_time: "2026-10-23T14:45:00.000Z",
      duration_min: 45,
      reason: "Cleaning",
      notes: null,
      google_event_id: "evt-1",
      status: "confirmed",
      _vapi_call_id: null,
      created_at: "2026-10-05T10:05:00.000Z",
    });

    it("greets a known caller by name and remembers their appointment", async () => {
      const { app } = buildTestApp({ seed: { calls: [priorCall()], appointments: [upcomingAppt()] } });
      const res = await post(app, { type: "assistant-request", call: call() }).expect(200);
      const { assistant } = res.body;
      expect(assistant.firstMessage).toContain("Welcome back to Harborview Dental!");
      expect(assistant.firstMessage).toContain("Am I speaking with Jordan?");
      const system = assistant.model.messages[0].content;
      expect(system).toContain("Returning caller");
      expect(system).toContain("Jordan Lee");
      expect(system).toMatch(/Upcoming appointment on file: Friday, October 23/);
      expect(system).toContain("confirm who they are");
    });

    it("treats an unrecognized number as a first-time caller", async () => {
      const { app } = buildTestApp({ seed: { calls: [priorCall()], appointments: [upcomingAppt()] } });
      const res = await post(app, {
        type: "assistant-request",
        call: { id: "new", phoneNumber: { number: "+16175550100" }, customer: { number: "+16175559999" } },
      }).expect(200);
      expect(res.body.assistant.firstMessage).not.toContain("Welcome back");
      expect(res.body.assistant.model.messages[0].content).not.toContain("Returning caller");
    });

    it("answers normally when the history lookup fails", async () => {
      const { app } = buildTestApp({
        repoOverrides: {
          getCallerHistory: async () => {
            throw new Error("db timeout");
          },
        },
      });
      const res = await post(app, { type: "assistant-request", call: call() }).expect(200);
      expect(res.body.assistant.name).toContain("Harborview Dental");
      expect(res.body.assistant.model.messages[0].content).not.toContain("Returning caller");
    });
  });
});

describe("tool-calls", () => {
  // NOW is Tue 2026-10-20 10:00 in Boston; Wednesday hours are 8:00-17:00.
  const wednesday = "2026-10-21";

  it("lists open times excluding busy blocks", async () => {
    const { app } = buildTestApp({
      busy: [{ start: new Date("2026-10-21T12:00:00Z"), end: new Date("2026-10-21T16:00:00Z") }], // 8:00-12:00 EDT
    });
    const res = await post(app, {
      type: "tool-calls",
      call: call(),
      toolCallList: [toolCall("check_availability", { date: wednesday })],
    }).expect(200);
    const { result, toolCallId } = res.body.results[0];
    expect(toolCallId).toBe("tc-1");
    expect(result).toMatch(/^Open times on 2026-10-21: 12:00 PM/);
    expect(result).not.toMatch(/\n/);
  });

  it("explains closed days and suggests the next open ones", async () => {
    const { app } = buildTestApp();
    const res = await post(app, {
      type: "tool-calls",
      call: call(),
      toolCallList: [toolCall("check_availability", { date: "2026-10-24" })],
    });
    expect(res.body.results[0].result).toMatch(/closed on 2026-10-24.*Monday, October 26 \(2026-10-26\)/);
  });

  it("rejects past dates", async () => {
    const { app } = buildTestApp();
    const res = await post(app, {
      type: "tool-calls",
      call: call(),
      toolCallList: [toolCall("check_availability", { date: "2026-10-19" })],
    });
    expect(res.body.results[0].result).toMatch(/in the past/);
  });

  it("books an appointment, writes the calendar, and is idempotent on retries", async () => {
    const { app, state, calendar } = buildTestApp();
    const message = {
      type: "tool-calls",
      call: call("booking-call"),
      toolCallList: [
        toolCall(
          "book_appointment",
          JSON.stringify({
            caller_name: "Jordan Lee",
            date_time: `${wednesday}T10:00:00`,
            reason: "Cleaning",
          }),
        ),
      ],
    };

    const first = await post(app, message).expect(200);
    expect(first.body.results[0].result).toMatch(
      /Booked: Jordan Lee on Wednesday, October 21 at 10:00 AM for 45 minutes/,
    );
    await post(app, message).expect(200);

    expect(state.appointments).toHaveLength(1);
    expect(calendar.events).toHaveLength(1);
    expect(state.appointments[0]).toMatchObject({
      start_time: "2026-10-21T14:00:00.000Z",
      end_time: "2026-10-21T14:45:00.000Z",
      caller_phone: "+16175550199",
      status: "confirmed",
    });
  });

  it("refuses conflicting and out-of-hours bookings", async () => {
    const { app, state } = buildTestApp({
      busy: [{ start: new Date("2026-10-21T14:00:00Z"), end: new Date("2026-10-21T15:00:00Z") }],
    });
    const book = (date_time: string) =>
      post(app, {
        type: "tool-calls",
        call: call(),
        toolCallList: [toolCall("book_appointment", { caller_name: "A", date_time })],
      });

    expect((await book(`${wednesday}T10:00:00`)).body.results[0].result).toMatch(/no longer available/);
    expect((await book(`${wednesday}T18:00:00`)).body.results[0].result).toMatch(/outside opening hours/);
    // Beyond the 90-day horizon, which book_appointment now enforces too.
    expect((await book("2027-06-01T10:00:00")).body.results[0].result).toMatch(/at most 90 days/);
    expect((await book("2026-10-20T10:30:00")).body.results[0].result).toMatch(/too soon/);
    expect(state.appointments).toHaveLength(0);
  });

  it("degrades gracefully without a calendar", async () => {
    const { app } = buildTestApp({ calendar: false });
    const res = await post(app, {
      type: "tool-calls",
      call: call(),
      toolCallList: [toolCall("check_availability", { date: wednesday })],
    });
    expect(res.body.results[0].result).toMatch(/Live scheduling is not available/);
  });

  it("stores messages once and texts the owner immediately when urgent", async () => {
    const { app, state, sms, flush } = buildTestApp();
    const message = {
      type: "tool-calls",
      call: call(),
      toolCallList: [
        toolCall("take_message", {
          caller_name: "Sam",
          message: "Cracked tooth, in a lot of pain",
          urgency: "high",
        }),
      ],
    };
    await post(app, message).expect(200);
    await post(app, message).expect(200);
    await flush();

    expect(state.messages).toHaveLength(1);
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({ to: "+16175550142" });
    expect(sms[0].body).toMatch(/URGENT message from Sam/);
  });

  it("returns 200 with per-call errors for bad input", async () => {
    const { app } = buildTestApp();
    const res = await post(app, {
      type: "tool-calls",
      call: call(),
      toolCallList: [toolCall("check_availability", "{not json", "a"), toolCall("launch_rockets", {}, "b")],
    }).expect(200);
    expect(res.body.results[0]).toMatchObject({
      toolCallId: "a",
      result: expect.stringMatching(/not valid JSON/),
    });
    expect(res.body.results[1]).toMatchObject({
      toolCallId: "b",
      error: expect.stringMatching(/Unknown tool/),
    });
  });

  it("turns handler crashes into a spoken apology", async () => {
    const { app } = buildTestApp({
      repoOverrides: {
        findAppointmentForCall: async () => {
          throw new Error("db timeout");
        },
      },
    });
    const res = await post(app, {
      type: "tool-calls",
      call: call(),
      toolCallList: [toolCall("book_appointment", { caller_name: "A", date_time: `${wednesday}T10:00:00` })],
    }).expect(200);
    expect(res.body.results[0].error).toMatch(/offer to take a message/);
  });
});

describe("end-of-call-report", () => {
  const report = (overrides: object = {}) => ({
    type: "end-of-call-report",
    call: call("eoc-1"),
    endedReason: "customer-ended-call",
    durationSeconds: 125,
    cost: 0.31,
    artifact: {
      transcript:
        "AI: Thanks for calling.\nCaller: Hi, my name is Jordan Lee. Do you take Delta Dental insurance?\nAI: Yes we do.\nCaller: Great, thanks!",
      recordingUrl: "https://storage.vapi.ai/eoc-1.wav",
    },
    ...overrides,
  });

  it("records the call, analyzes it, and notifies the owner once", async () => {
    const { app, state, sms, emails, flush } = buildTestApp({ analyzer: createHeuristicAnalyzer() });

    await post(app, report()).expect(200);
    await post(app, report()).expect(200); // Vapi retry
    await flush();

    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({
      vapi_call_id: "eoc-1",
      duration_seconds: 125,
      cost_cents: 31,
      recording_url: "https://storage.vapi.ai/eoc-1.wav",
      outcome: "faq_answered",
      sentiment: "positive",
      caller_name: "Jordan Lee",
      follow_up_required: false,
    });
    expect(state.calls[0].analysis?.topics).toContain("insurance");
    expect(sms).toHaveLength(1);
    expect(sms[0].body).toMatch(/Question answered · Harborview Dental/);
    expect(emails).toHaveLength(1);
    expect(emails[0].html).toContain("http://localhost:5173/calls?call=");
  });

  it("links appointments made during the call", async () => {
    const { app, state, flush } = buildTestApp();
    await post(app, {
      type: "tool-calls",
      call: call("eoc-1"),
      toolCallList: [
        toolCall("book_appointment", { caller_name: "Jordan", date_time: "2026-10-21T10:00:00" }),
      ],
    });
    await post(app, report()).expect(200);
    await flush();

    expect(state.calls[0].outcome).toBe("appointment_booked");
    expect(state.appointments[0].call_id).toBe(state.calls[0].id);
  });

  it("flags failed transfers for follow-up", async () => {
    const { app, state, sms, flush } = buildTestApp();
    await post(app, report({ endedReason: "pipeline-error-forwarding-call-failed" })).expect(200);
    await flush();
    expect(state.calls[0].follow_up_required).toBe(true);
    expect(sms[0].body).toMatch(/Transfer to you failed/);
  });

  it("returns 500 so Vapi retries when the database write fails", async () => {
    const { app } = buildTestApp({
      repoOverrides: {
        upsertCall: async () => {
          throw new Error("db down");
        },
      },
    });
    await post(app, report()).expect(500);
  });
});

describe("misc", () => {
  it("acknowledges informational events and rejects garbage", async () => {
    const { app } = buildTestApp();
    await post(app, { type: "speech-update", call: call() }).expect(200, { ok: true });
    await request(app).post("/webhooks/vapi").set("X-Vapi-Secret", SECRET).send({ hello: 1 }).expect(400);
  });

  it("supports the legacy function-call message", async () => {
    const { app } = buildTestApp();
    const res = await post(app, {
      type: "function-call",
      call: call(),
      functionCall: { name: "check_availability", parameters: { date: "2026-10-21" } },
    }).expect(200);
    expect(res.body.result).toMatch(/Open times/);
  });
});
