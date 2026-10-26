import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { demoBusiness } from "../../src/demo/fixtures";
import type { CallRecord } from "../../src/domain/types";
import { buildTestApp, OWNER, TOKEN } from "../helpers/test-app";

const authed = (app: ReturnType<typeof buildTestApp>["app"]) => ({
  get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${TOKEN}`),
  patch: (url: string, body: object) =>
    request(app).patch(url).set("Authorization", `Bearer ${TOKEN}`).send(body),
  post: (url: string, body: object) =>
    request(app).post(url).set("Authorization", `Bearer ${TOKEN}`).send(body),
  delete: (url: string) => request(app).delete(url).set("Authorization", `Bearer ${TOKEN}`),
});

function callRow(overrides: Partial<CallRecord>): CallRecord {
  return {
    id: crypto.randomUUID(),
    business_id: demoBusiness().id,
    vapi_call_id: crypto.randomUUID(),
    caller_number: "+16175550199",
    caller_name: null,
    direction: "inbound",
    status: "completed",
    duration_seconds: 60,
    summary: null,
    transcript: null,
    recording_url: null,
    outcome: "other",
    sentiment: null,
    follow_up_required: false,
    analysis: null,
    cost_cents: 10,
    ended_reason: null,
    owner_notified_at: null,
    created_at: "2026-10-20T13:00:00.000Z",
    ...overrides,
  };
}

describe("auth", () => {
  it("requires a valid session", async () => {
    const { app } = buildTestApp();
    await request(app).get("/api/business").expect(401);
    await request(app).get("/api/business").set("Authorization", "Bearer nope").expect(401);
  });

  it("returns 403 for users without a business", async () => {
    const { app } = buildTestApp();
    await request(app).get("/api/business").set("Authorization", "Bearer stranger").expect(403);
  });

  it("claims an unowned business by matching email", async () => {
    const { app, state } = buildTestApp({ businesses: [demoBusiness({ owner_user_id: null })] });
    await authed(app).get("/api/business").expect(200);
    expect(state.businesses[0].owner_user_id).toBe(OWNER.id);
  });
});

describe("tenant isolation", () => {
  it("never returns another business's calls", async () => {
    const other = callRow({ business_id: "99999999-9999-4999-8999-999999999999" });
    const mine = callRow({});
    const { app } = buildTestApp({ seed: { calls: [other, mine] } });

    const list = await authed(app).get("/api/calls").expect(200);
    expect(list.body.map((c: CallRecord) => c.id)).toEqual([mine.id]);
    await authed(app).get(`/api/calls/${other.id}`).expect(404);
    await authed(app).patch(`/api/calls/${other.id}`, { follow_up_required: false }).expect(404);
  });
});

describe("business settings", () => {
  it("hides OAuth tokens and internal fields", async () => {
    const { app } = buildTestApp();
    const res = await authed(app).get("/api/business").expect(200);
    expect(res.body.name).toBe("Harborview Dental");
    expect(res.body).not.toHaveProperty("google_calendar_tokens");
    expect(res.body).not.toHaveProperty("owner_user_id");
    expect(res.body).not.toHaveProperty("system_prompt_override");
  });

  it("validates and normalizes updates", async () => {
    const { app } = buildTestApp();
    const ok = await authed(app)
      .patch("/api/business", {
        owner_phone: "(617) 555-0111",
        business_hours: { mon: "9:00-12:00", sat: "closed" },
      })
      .expect(200);
    expect(ok.body.owner_phone).toBe("+16175550111");
    expect(ok.body.business_hours).toEqual({ mon: "9:00-12:00", sat: "closed" });

    await authed(app).patch("/api/business", { timezone: "Mars/Base" }).expect(400);
    await authed(app)
      .patch("/api/business", { business_hours: { mon: "5pm-9am" } })
      .expect(400);
    await authed(app)
      .patch("/api/business", { business_hours: { funday: "9:00-10:00" } })
      .expect(400);
    await authed(app).patch("/api/business", { owner_user_id: "hijack" }).expect(400);
    await authed(app).patch("/api/business", {}).expect(400);
  });

  it("previews the exact prompt the receptionist receives", async () => {
    const { app } = buildTestApp();
    const res = await authed(app).get("/api/business/prompt-preview").expect(200);
    expect(res.body.firstMessage).toMatch(/Harborview Dental/);
    expect(res.body.systemPrompt).toMatch(/Today is Tuesday, October 20, 2026/);
  });
});

describe("FAQ", () => {
  it("supports create, update and delete", async () => {
    const { app } = buildTestApp();
    const created = await authed(app)
      .post("/api/faqs", { question: "Do you see kids?", answer: "Yes, from age 3.", category: "services" })
      .expect(201);
    expect(created.body.sort_order).toBe(5);

    const updated = await authed(app)
      .patch(`/api/faqs/${created.body.id}`, { answer: "Yes, from age 2." })
      .expect(200);
    expect(updated.body.answer).toBe("Yes, from age 2.");

    await authed(app).delete(`/api/faqs/${created.body.id}`).expect(200);
    await authed(app).delete(`/api/faqs/${created.body.id}`).expect(404);
    await authed(app).post("/api/faqs", { question: "", answer: "x" }).expect(400);
  });
});

describe("messages and calls", () => {
  it("marks messages read and unread", async () => {
    const { app, state } = buildTestApp({
      seed: {
        messages: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            business_id: demoBusiness().id,
            call_id: null,
            caller_name: "Sam",
            caller_phone: null,
            content: "Call me",
            urgency: "medium",
            is_read: false,
            _vapi_call_id: null,
            created_at: "2026-10-20T13:00:00Z",
          },
        ],
      },
    });
    await authed(app)
      .patch("/api/messages/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { is_read: true })
      .expect(200);
    expect(state.messages[0].is_read).toBe(true);
    await authed(app)
      .patch("/api/messages/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { is_read: "yes" })
      .expect(400);
  });

  it("resolves follow-ups", async () => {
    const row = callRow({ follow_up_required: true });
    const { app } = buildTestApp({ seed: { calls: [row] } });
    const res = await authed(app).patch(`/api/calls/${row.id}`, { follow_up_required: false }).expect(200);
    expect(res.body.follow_up_required).toBe(false);
  });

  it("summarizes analytics in the business time zone", async () => {
    const { app } = buildTestApp({
      seed: {
        calls: [
          callRow({ outcome: "appointment_booked", created_at: "2026-10-20T13:00:00Z" }),
          callRow({ outcome: "missed", created_at: "2026-10-20T02:00:00Z", follow_up_required: true }),
        ],
      },
    });
    const res = await authed(app).get("/api/analytics/summary?days=7").expect(200);
    expect(res.body).toMatchObject({
      totalCalls: 2,
      answeredCalls: 1,
      followUpsOpen: 1,
      afterHoursCalls: 1,
      unreadMessages: 0,
    });
    expect(res.body.daily).toHaveLength(7);
    await authed(app).get("/api/analytics/summary?days=400").expect(400);
  });
});

describe("Google Calendar OAuth", () => {
  const oauth = () => ({
    configured: true,
    getAuthUrl: (state: string) => `https://accounts.google.com/o/oauth2/auth?state=${state}`,
    connect: vi.fn(async () => {}),
  });

  it("issues a signed URL and accepts a matching callback", async () => {
    const calendarOAuth = oauth();
    const { app, oauthState } = buildTestApp({ calendarOAuth });
    const start = await authed(app).get("/api/auth/google/start").expect(200);
    const state = new URL(start.body.url).searchParams.get("state")!;
    expect(oauthState.verify(state)).toBeTruthy();

    const cb = await request(app).get(`/api/auth/google/callback?code=abc&state=${state}`).expect(302);
    expect(cb.headers.location).toBe("http://localhost:5173/settings?google_calendar=connected");
    expect(calendarOAuth.connect).toHaveBeenCalledWith(demoBusiness().id, "abc");
  });

  it("rejects forged state and states for a business the user doesn't own", async () => {
    const calendarOAuth = oauth();
    const { app, oauthState } = buildTestApp({ calendarOAuth });

    const forged = await request(app).get("/api/auth/google/callback?code=abc&state=forged.sig").expect(302);
    expect(forged.headers.location).toMatch(/invalid_state/);

    const wrongUser = oauthState.sign({ businessId: demoBusiness().id, userId: "someone-else" });
    const res = await request(app).get(`/api/auth/google/callback?code=abc&state=${wrongUser}`).expect(302);
    expect(res.headers.location).toMatch(/business_mismatch/);
    expect(calendarOAuth.connect).not.toHaveBeenCalled();
  });

  it("reports when calendar is not configured", async () => {
    const { app } = buildTestApp();
    await authed(app).get("/api/auth/google/start").expect(503);
  });
});

describe("platform", () => {
  it("serves health with integration status and security headers", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toMatchObject({ status: "ok", db: "ok", integrations: { sms: true } });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("reports degraded health without leaking errors", async () => {
    const { app } = buildTestApp({
      repoOverrides: {
        ping: async () => {
          throw new Error("password authentication failed for user postgres");
        },
      },
    });
    const res = await request(app).get("/health").expect(503);
    expect(JSON.stringify(res.body)).not.toMatch(/password/);
  });

  it("returns JSON 404s and hides internal errors", async () => {
    const { app } = buildTestApp({
      repoOverrides: {
        listFaqs: async () => {
          throw new Error("relation faq_items does not exist");
        },
      },
    });
    await request(app).get("/nope").expect(404, { error: "Not found" });
    const res = await authed(app).get("/api/faqs").expect(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });

  it("allows CORS only for the dashboard origin", async () => {
    const { app } = buildTestApp();
    const ok = await request(app)
      .options("/api/business")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    const bad = await request(app)
      .options("/api/business")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
