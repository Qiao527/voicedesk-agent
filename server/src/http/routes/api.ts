import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { summarizeCalls } from "../../domain/analytics";
import { normalizeE164 } from "../../domain/phone";
import { isValidTimeZone, parseHoursRange } from "../../domain/time";
import { WEEKDAYS, type Business, type PublicBusiness } from "../../domain/types";
import type { Logger } from "../../lib/logger";
import type { Repository } from "../../repositories/repository";
import type { CalendarOAuth } from "../../services/calendar";
import type { OAuthStateSigner } from "../../services/oauth-state";
import { buildFirstMessage, buildSystemPrompt } from "../../vapi/assistant";
import { auth, createRequireAuth, type VerifyAccessToken } from "../middleware/require-auth";

export interface ApiDeps {
  repo: Repository;
  verifyToken: VerifyAccessToken;
  calendarOAuth: CalendarOAuth | null;
  oauthState: OAuthStateSigner;
  dashboardUrl: string;
  logger: Logger;
  now: () => Date;
}

// ─── Validation ──────────────────────────────────────────────────────

const Uuid = z.object({ id: z.uuid() });

const HoursValue = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v.toLowerCase() === "closed" || parseHoursRange(v) !== null, {
    message: "must be 'closed' or 'HH:MM-HH:MM' with close after open",
  });

const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v));

const BusinessUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  owner_name: nullableText(200),
  owner_phone: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (v === null || v.trim() === "") return null;
      const e164 = normalizeE164(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "must be a valid phone number, e.g. +16175551234" });
        return z.NEVER;
      }
      return e164;
    }),
  owner_email: z
    .union([z.email().max(200), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
  address: nullableText(500),
  timezone: z
    .string()
    .trim()
    .refine(isValidTimeZone, { message: "must be an IANA time zone, e.g. America/New_York" })
    .optional(),
  business_hours: z.partialRecord(z.enum(WEEKDAYS), HoursValue).optional(),
  greeting_message: nullableText(500),
  // Two-party-consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA) require
  // a recording disclosure. Null disables it, at the owner's legal risk.
  recording_disclosure: nullableText(300),
  appointment_duration_min: z.number().int().min(10).max(240).optional(),
});

const FaqCreateSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2000),
  category: z
    .union([z.string().trim().max(64), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
});
const FaqUpdateSchema = FaqCreateSchema.partial();

const CallPatchSchema = z.strictObject({ follow_up_required: z.boolean() });
const MessagePatchSchema = z.strictObject({ is_read: z.boolean() });
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const AnalyticsQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

function badRequest(res: Response, error: z.ZodError) {
  const issue = error.issues[0];
  const field = issue.path.length ? issue.path.join(".") : "body";
  res.status(400).json({ error: `${field} ${issue.message}`, issues: error.issues });
}

function toPublic(b: Business): PublicBusiness {
  return {
    id: b.id,
    name: b.name,
    owner_name: b.owner_name,
    owner_phone: b.owner_phone,
    owner_email: b.owner_email,
    address: b.address,
    timezone: b.timezone,
    business_hours: b.business_hours,
    greeting_message: b.greeting_message,
    recording_disclosure: b.recording_disclosure,
    vapi_phone_number: b.vapi_phone_number,
    calendar_id: b.calendar_id,
    google_calendar_connected_at: b.google_calendar_connected_at,
    appointment_duration_min: b.appointment_duration_min,
    status: b.status,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────

/**
 * Dashboard REST API. Every route after `requireAuth` is scoped to the
 * caller's business id; nothing reads a business id from the client.
 * Async errors propagate to the app error handler (Express 5).
 */
export function createApiRouter(deps: ApiDeps): Router {
  const { repo } = deps;
  const router = Router();

  const settingsRedirect = (res: Response, status: "connected" | "error", detail?: string) => {
    const url = new URL("/settings", deps.dashboardUrl);
    url.searchParams.set("google_calendar", status);
    if (detail) url.searchParams.set("google_calendar_detail", detail);
    res.redirect(url.toString());
  };

  // Google redirects here without a session, so this route is public. The
  // signed `state` proves which business started the flow.
  router.get("/auth/google/callback", async (req: Request, res: Response) => {
    const q = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .safeParse(req.query);
    if (!q.success) return settingsRedirect(res, "error", "invalid_callback");
    if (q.data.error) return settingsRedirect(res, "error", q.data.error.slice(0, 64));
    if (!q.data.code || !q.data.state) return settingsRedirect(res, "error", "missing_code");
    if (!deps.calendarOAuth?.configured) return settingsRedirect(res, "error", "not_configured");

    const state = deps.oauthState.verify(q.data.state);
    if (!state) return settingsRedirect(res, "error", "invalid_state");

    const business = await repo.getBusiness(state.bid);
    if (!business || business.owner_user_id !== state.uid) {
      return settingsRedirect(res, "error", "business_mismatch");
    }

    try {
      await deps.calendarOAuth.connect(business.id, q.data.code);
      deps.logger.info("calendar.connected", { businessId: business.id });
      settingsRedirect(res, "connected");
    } catch (err) {
      deps.logger.warn("calendar.connect_failed", { businessId: business.id, error: String(err) });
      settingsRedirect(res, "error", "oauth_failed");
    }
  });

  router.use(createRequireAuth({ verifyToken: deps.verifyToken, repo }));

  // ─── Google Calendar ────────────────────────────────────────────────
  router.get("/auth/google/start", (req, res) => {
    if (!deps.calendarOAuth?.configured) {
      res.status(503).json({ error: "Google Calendar is not configured on this server" });
      return;
    }
    const { businessId, userId } = auth(req);
    res.json({ url: deps.calendarOAuth.getAuthUrl(deps.oauthState.sign({ businessId, userId })) });
  });

  router.delete("/auth/google", async (req, res) => {
    await repo.clearCalendarTokens(auth(req).businessId);
    res.json({ ok: true });
  });

  // ─── Business ───────────────────────────────────────────────────────
  router.get("/business", async (req, res) => {
    const business = await repo.getBusiness(auth(req).businessId);
    if (!business) {
      res.status(404).json({ error: "Business not found" });
      return;
    }
    res.json(toPublic(business));
  });

  router.patch("/business", async (req, res) => {
    const parsed = BusinessUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);

    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as typeof parsed.data;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "No updatable fields in request" });
      return;
    }

    const updated = await repo.updateBusiness(auth(req).businessId, patch as never);
    if (!updated) {
      res.status(404).json({ error: "Business not found" });
      return;
    }
    res.json(toPublic(updated));
  });

  /** What the receptionist is told on every call. Lets owners audit the AI. */
  router.get("/business/prompt-preview", async (req, res) => {
    const { businessId } = auth(req);
    const [business, faqs] = await Promise.all([repo.getBusiness(businessId), repo.listFaqs(businessId)]);
    if (!business) {
      res.status(404).json({ error: "Business not found" });
      return;
    }
    res.json({
      firstMessage: buildFirstMessage(business),
      systemPrompt: buildSystemPrompt(business, faqs, deps.now()),
    });
  });

  // ─── FAQ ────────────────────────────────────────────────────────────
  router.get("/faqs", async (req, res) => {
    res.json(await repo.listFaqs(auth(req).businessId));
  });

  router.post("/faqs", async (req, res) => {
    const parsed = FaqCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    res.status(201).json(await repo.createFaq(auth(req).businessId, parsed.data));
  });

  router.patch("/faqs/:id", async (req, res) => {
    const params = Uuid.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const parsed = FaqUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    const faq = await repo.updateFaq(auth(req).businessId, params.data.id, parsed.data);
    if (!faq) {
      res.status(404).json({ error: "FAQ not found" });
      return;
    }
    res.json(faq);
  });

  router.delete("/faqs/:id", async (req, res) => {
    const params = Uuid.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const deleted = await repo.deleteFaq(auth(req).businessId, params.data.id);
    res.status(deleted ? 200 : 404).json(deleted ? { ok: true } : { error: "FAQ not found" });
  });

  // ─── Calls ──────────────────────────────────────────────────────────
  router.get("/calls", async (req, res) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return badRequest(res, q.error);
    res.json(await repo.listCalls(auth(req).businessId, { limit: q.data.limit }));
  });

  router.get("/calls/:id", async (req, res) => {
    const params = Uuid.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const call = await repo.getCall(auth(req).businessId, params.data.id);
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    const [appointments, messages] = await Promise.all([
      repo.listAppointmentsForVapiCall(call.vapi_call_id),
      repo.listMessagesForVapiCall(call.vapi_call_id),
    ]);
    res.json({ ...call, appointments, messages });
  });

  router.patch("/calls/:id", async (req, res) => {
    const params = Uuid.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const parsed = CallPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    const call = await repo.setFollowUp(auth(req).businessId, params.data.id, parsed.data.follow_up_required);
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    res.json(call);
  });

  // ─── Messages ───────────────────────────────────────────────────────
  router.get("/messages", async (req, res) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return badRequest(res, q.error);
    res.json(await repo.listMessages(auth(req).businessId, { limit: q.data.limit }));
  });

  const setRead = async (req: Request, res: Response, isRead: boolean) => {
    const params = Uuid.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const ok = await repo.setMessageRead(auth(req).businessId, params.data.id, isRead);
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: "Message not found" });
  };

  router.patch("/messages/:id", async (req, res) => {
    const parsed = MessagePatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    await setRead(req, res, parsed.data.is_read);
  });
  // Kept for older dashboard builds.
  router.patch("/messages/:id/read", (req, res) => setRead(req, res, true));

  // ─── Appointments ───────────────────────────────────────────────────
  router.get("/appointments", async (req, res) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return badRequest(res, q.error);
    res.json(await repo.listAppointments(auth(req).businessId, { limit: q.data.limit }));
  });

  // ─── Analytics ──────────────────────────────────────────────────────
  router.get("/analytics/summary", async (req, res) => {
    const q = AnalyticsQuery.safeParse(req.query);
    if (!q.success) return badRequest(res, q.error);
    const { businessId } = auth(req);
    const now = deps.now();
    const since = new Date(now.getTime() - q.data.days * 86_400_000).toISOString();

    const [business, calls, unreadMessages] = await Promise.all([
      repo.getBusiness(businessId),
      repo.listCalls(businessId, { limit: 5000, since }),
      repo.countUnreadMessages(businessId),
    ]);

    const summary = summarizeCalls({
      calls,
      now,
      periodDays: q.data.days,
      timeZone: business?.timezone ?? "America/New_York",
      businessHours: business?.business_hours ?? null,
    });
    res.json({ ...summary, unreadMessages });
  });

  return router;
}
