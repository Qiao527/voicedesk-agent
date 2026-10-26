import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { supabase } from "../services/supabase";
import {
  CalendarIntegrationError,
  exchangeCodeForTokens,
  getAuthUrl,
  mergeStoredGoogleCalendarTokens,
} from "../services/calendar";
import { signOAuthState, verifyOAuthState } from "../services/oauth-state";
import { normalizeE164 } from "../services/phone";
import { requireAuth } from "../middleware/require-auth";

export const apiRouter = Router();

const PUBLIC_BUSINESS_COLUMNS = [
  "id",
  "name",
  "owner_name",
  "owner_phone",
  "owner_email",
  "address",
  "timezone",
  "business_hours",
  "greeting_message",
  "recording_disclosure",
  "vapi_phone_number",
  "calendar_id",
  "google_calendar_connected_at",
  "status",
].join(", ");

const GoogleAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

// ─── Shared request schemas ─────────────────────────────────────────
//
// All dashboard write-paths run their input through Zod before touching
// Supabase. Keeps invalid payloads out of the DB and gives the dashboard
// an actionable error message instead of a 500.

const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

// Caps chosen to keep one caller from filling a row with megabytes of text.
// Generous for real business data; tight enough to reject abuse.
const NAME_MAX = 200;
const TEXT_SHORT_MAX = 500;
const TEXT_LONG_MAX = 2000;

// Hours value like "9:00-17:00" or "closed". Enforced so Claude's system
// prompt doesn't end up with unbounded free text.
const HoursValueSchema = z
  .string()
  .max(40)
  .regex(
    /^(closed|(\d{1,2}:\d{2})-(\d{1,2}:\d{2}))$/i,
    "must be 'closed' or 'HH:MM-HH:MM'",
  );

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const BusinessHoursSchema = z
  .record(z.enum(DAY_KEYS), HoursValueSchema)
  .refine(
    (h) => Object.keys(h).length <= 7,
    "business_hours may only contain mon–sun keys",
  );

// Optional-with-null: convert empty strings to null, keep undefined as "no update".
const optionalNullableTrimmed = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.length === 0 ? null : v));

const BusinessUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    owner_name: optionalNullableTrimmed(NAME_MAX),
    owner_phone: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v, ctx) => {
        if (v === undefined) return undefined;
        if (v === null || v === "") return null;
        const normalized = normalizeE164(v);
        if (!normalized) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "owner_phone must be a valid phone number (e.g. +16175551234)",
          });
          return z.NEVER;
        }
        return normalized;
      }),
    owner_email: z
      .union([z.string().trim().email().max(NAME_MAX), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" ? null : v)),
    address: optionalNullableTrimmed(TEXT_SHORT_MAX),
    timezone: z.string().trim().min(1).max(64).optional(),
    business_hours: BusinessHoursSchema.optional(),
    greeting_message: optionalNullableTrimmed(TEXT_LONG_MAX),
    // Two-party-consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA)
    // require a recording disclosure before speech. Owners can edit it per
    // business (e.g. translate, or tailor wording); setting it to null
    // disables the prefix entirely (owner's legal risk if they do this).
    recording_disclosure: optionalNullableTrimmed(TEXT_SHORT_MAX),
  })
  .strict();

const FaqCreateSchema = z
  .object({
    question: z.string().trim().min(1).max(TEXT_SHORT_MAX),
    answer: z.string().trim().min(1).max(TEXT_LONG_MAX),
    category: z
      .union([z.string().trim().max(64), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v == null ? null : v)),
  })
  .strict();

function respondZodError(res: Response, err: z.ZodError): void {
  const first = err.issues[0];
  const path = first.path.length > 0 ? first.path.join(".") : "body";
  res.status(400).json({
    error: `Invalid request: ${path} — ${first.message}`,
    issues: err.issues,
  });
}

function redirectToSettings(
  res: Response,
  status: "connected" | "error",
  detail?: string,
) {
  const url = new URL("/settings", env.DASHBOARD_URL);
  url.searchParams.set("google_calendar", status);

  if (detail) {
    url.searchParams.set("google_calendar_detail", detail);
  }

  res.redirect(url.toString());
}

// Small helper so every authenticated handler is guaranteed a business id.
function bizId(req: Request): string {
  // requireAuth guarantees req.auth is set before a handler runs.
  return req.auth!.businessId;
}

// ─── Google Calendar OAuth callback ──────────────────────────────────
// Unauthenticated on purpose — Google redirects the browser here after the
// consent screen with no Supabase bearer token. The `state` param is an
// HMAC-signed token minted by the authenticated start route, so we can still
// prove the flow was initiated by a real dashboard user for a real business.

apiRouter.get("/auth/google/callback", async (req: Request, res: Response) => {
  const parsed = GoogleAuthCallbackQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    redirectToSettings(res, "error", "invalid_callback");
    return;
  }

  if (parsed.data.error) {
    redirectToSettings(res, "error", parsed.data.error);
    return;
  }

  if (!parsed.data.code || !parsed.data.state) {
    redirectToSettings(res, "error", "missing_code_or_state");
    return;
  }

  const payload = verifyOAuthState(parsed.data.state);
  if (!payload) {
    redirectToSettings(res, "error", "invalid_state");
    return;
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, google_calendar_tokens")
    .eq("id", payload.bid)
    .maybeSingle();

  if (businessError || !business) {
    redirectToSettings(res, "error", "business_not_found");
    return;
  }

  try {
    const incomingTokens = await exchangeCodeForTokens(parsed.data.code);
    const mergedTokens = mergeStoredGoogleCalendarTokens(
      business.google_calendar_tokens,
      incomingTokens,
    );

    const { error } = await supabase
      .from("businesses")
      .update({
        google_calendar_tokens: mergedTokens,
        google_calendar_connected_at: new Date().toISOString(),
      })
      .eq("id", business.id);

    if (error) {
      redirectToSettings(res, "error", "persist_failed");
      return;
    }

    redirectToSettings(res, "connected");
  } catch (error) {
    const detail =
      error instanceof CalendarIntegrationError ? error.message : "oauth_failed";
    redirectToSettings(res, "error", detail);
  }
});

// ─── Everything below requires an authenticated dashboard session ────
// Scoped to req.auth.businessId so users can only see their own data.

apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  requireAuth(req, res, next);
});

// ─── Google Calendar OAuth start (authenticated) ─────────────────────
// Returns a signed Google auth URL bound to the caller's businessId, so an
// attacker can't initiate OAuth against a business they don't own.

apiRouter.get("/auth/google/start", async (req: Request, res: Response) => {
  try {
    const state = signOAuthState({
      businessId: bizId(req),
      userId: req.auth!.userId,
    });
    const url = getAuthUrl({ state });
    res.json({ url });
  } catch (error) {
    if (error instanceof CalendarIntegrationError) {
      res.status(503).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Failed to start Google Calendar auth" });
  }
});

// ─── Calls ───────────────────────────────────────────────────────────

apiRouter.get("/calls", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("business_id", bizId(req))
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

apiRouter.get("/calls/:id", async (req: Request, res: Response) => {
  const params = UuidParamSchema.safeParse(req.params);
  if (!params.success) {
    respondZodError(res, params.error);
    return;
  }

  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("business_id", bizId(req))
    .eq("id", params.data.id)
    .maybeSingle();

  if (error || !data) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  res.json(data);
});

// ─── Messages ────────────────────────────────────────────────────────

apiRouter.get("/messages", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("business_id", bizId(req))
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

apiRouter.patch("/messages/:id/read", async (req: Request, res: Response) => {
  const params = UuidParamSchema.safeParse(req.params);
  if (!params.success) {
    respondZodError(res, params.error);
    return;
  }

  const { error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .eq("business_id", bizId(req))
    .eq("id", params.data.id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

// ─── Business ────────────────────────────────────────────────────────

apiRouter.get("/business", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("businesses")
    .select(PUBLIC_BUSINESS_COLUMNS)
    .eq("id", bizId(req))
    .maybeSingle();

  if (error || !data) {
    res.status(404).json({ error: error?.message || "Business not found" });
    return;
  }
  res.json(data);
});

apiRouter.patch("/business", async (req: Request, res: Response) => {
  const parsed = BusinessUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    respondZodError(res, parsed.error);
    return;
  }

  // Drop `undefined` keys so Supabase doesn't overwrite columns the caller
  // didn't mention. `null` is preserved because that's a real "clear this
  // field" signal from the dashboard.
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields in request" });
    return;
  }

  const { data, error } = await supabase
    .from("businesses")
    .update(updates)
    .eq("id", bizId(req))
    .select(PUBLIC_BUSINESS_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    res.status(500).json({ error: error?.message || "Update failed" });
    return;
  }
  res.json(data);
});

// ─── FAQs ────────────────────────────────────────────────────────────

apiRouter.get("/faqs", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("faq_items")
    .select("*")
    .eq("business_id", bizId(req))
    .order("sort_order", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

apiRouter.post("/faqs", async (req: Request, res: Response) => {
  const parsed = FaqCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    respondZodError(res, parsed.error);
    return;
  }

  const { data, error } = await supabase
    .from("faq_items")
    .insert({
      business_id: bizId(req),
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

apiRouter.delete("/faqs/:id", async (req: Request, res: Response) => {
  const params = UuidParamSchema.safeParse(req.params);
  if (!params.success) {
    respondZodError(res, params.error);
    return;
  }

  const { error } = await supabase
    .from("faq_items")
    .delete()
    .eq("business_id", bizId(req))
    .eq("id", params.data.id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

// ─── Appointments ────────────────────────────────────────────────────

apiRouter.get("/appointments", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("business_id", bizId(req))
    .order("start_time", { ascending: false })
    .limit(100);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

// ─── Analytics ───────────────────────────────────────────────────────

apiRouter.get("/analytics/summary", async (req: Request, res: Response) => {
  const businessId = bizId(req);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { data: calls, error } = await supabase
    .from("calls")
    .select("id, duration_seconds")
    .eq("business_id", businessId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const totalCalls = calls?.length || 0;
  const totalDuration =
    calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0;
  const avgDuration =
    totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  const { count: unreadMessages } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("is_read", false);

  // Exclude cancelled appointments — they're a real row in the table but the
  // owner shouldn't see them in the "appointments booked" headline number.
  const { count: appointmentCount } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .neq("status", "cancelled")
    .gte("created_at", thirtyDaysAgo.toISOString());

  res.json({
    totalCalls,
    avgDurationSeconds: avgDuration,
    totalDurationSeconds: totalDuration,
    unreadMessages: unreadMessages || 0,
    appointmentCount: appointmentCount || 0,
    period: "last_30_days",
  });
});

apiRouter.get("/analytics/daily-calls", async (req: Request, res: Response) => {
  const businessId = bizId(req);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { data: calls, error } = await supabase
    .from("calls")
    .select("created_at")
    .eq("business_id", businessId)
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const counts = new Map<string, number>();
  for (const call of calls || []) {
    const date = call.created_at.slice(0, 10);
    counts.set(date, (counts.get(date) || 0) + 1);
  }

  const result: { date: string; count: number }[] = [];
  const d = new Date(thirtyDaysAgo);
  while (d <= now) {
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: counts.get(key) || 0 });
    d.setDate(d.getDate() + 1);
  }

  res.json(result);
});
