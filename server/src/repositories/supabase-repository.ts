import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Appointment, Business, CallRecord, FaqItem, Message } from "../domain/types";
import type { Repository } from "./repository";

export class RepositoryError extends Error {
  constructor(
    operation: string,
    override readonly cause: PostgrestError | Error,
  ) {
    super(`${operation} failed: ${cause.message}`);
    this.name = "RepositoryError";
  }
}

function unwrap<T>(operation: string, result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw new RepositoryError(operation, result.error);
  return result.data;
}

/** Postgres unique-violation. Used to treat a retried insert as success. */
function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === "23505";
}

const BUSINESS_COLUMNS =
  "id, name, phone, owner_user_id, owner_name, owner_email, owner_phone, address, vapi_phone_number, vapi_phone_id, calendar_id, google_calendar_connected_at, timezone, business_hours, greeting_message, recording_disclosure, system_prompt_override, appointment_duration_min, status, created_at";

/**
 * Supabase-backed repository. The server uses the service-role key, which
 * bypasses RLS, so every dashboard query here filters by `business_id`
 * explicitly. RLS policies in the schema are a second line of defense.
 */
export function createSupabaseRepository(db: SupabaseClient): Repository {
  const repo: Repository = {
    async getBusiness(businessId) {
      const res = await db.from("businesses").select(BUSINESS_COLUMNS).eq("id", businessId).maybeSingle();
      return unwrap("getBusiness", res) as Business | null;
    },

    async findBusinessByVapiNumber(phoneNumber) {
      const res = await db
        .from("businesses")
        .select(BUSINESS_COLUMNS)
        .eq("vapi_phone_number", phoneNumber)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return unwrap("findBusinessByVapiNumber", res) as Business | null;
    },

    async findBusinessByVapiPhoneId(phoneId) {
      const res = await db
        .from("businesses")
        .select(BUSINESS_COLUMNS)
        .eq("vapi_phone_id", phoneId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return unwrap("findBusinessByVapiPhoneId", res) as Business | null;
    },

    async findBusinessIdForUser(user) {
      const byId = await db
        .from("businesses")
        .select("id")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const owned = unwrap("findBusinessIdForUser", byId) as { id: string } | null;
      if (owned) return owned.id;

      if (!user.email) return null;

      // Backfill path for businesses created by the onboarding CLI before the
      // owner had an account. Only claims rows that are not owned yet.
      const byEmail = await db
        .from("businesses")
        .select("id")
        .is("owner_user_id", null)
        .ilike("owner_email", user.email)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const unclaimed = unwrap("findBusinessIdForUser", byEmail) as { id: string } | null;
      if (!unclaimed) return null;

      const claim = await db
        .from("businesses")
        .update({ owner_user_id: user.id })
        .eq("id", unclaimed.id)
        .is("owner_user_id", null);
      unwrap("claimBusiness", { data: null, error: claim.error });
      return unclaimed.id;
    },

    async updateBusiness(businessId, patch) {
      const res = await db
        .from("businesses")
        .update(patch)
        .eq("id", businessId)
        .select(BUSINESS_COLUMNS)
        .maybeSingle();
      return unwrap("updateBusiness", res) as Business | null;
    },

    async getCalendarTokens(businessId) {
      const res = await db
        .from("businesses")
        .select("google_calendar_tokens")
        .eq("id", businessId)
        .maybeSingle();
      const row = unwrap("getCalendarTokens", res) as { google_calendar_tokens: unknown } | null;
      return row?.google_calendar_tokens ?? null;
    },

    async saveCalendarTokens(businessId, tokens, connectedAt) {
      const res = await db
        .from("businesses")
        .update({ google_calendar_tokens: tokens, google_calendar_connected_at: connectedAt })
        .eq("id", businessId);
      unwrap("saveCalendarTokens", { data: null, error: res.error });
    },

    async clearCalendarTokens(businessId) {
      const res = await db
        .from("businesses")
        .update({ google_calendar_tokens: null, google_calendar_connected_at: null })
        .eq("id", businessId);
      unwrap("clearCalendarTokens", { data: null, error: res.error });
    },

    async listFaqs(businessId) {
      const res = await db
        .from("faq_items")
        .select("*")
        .eq("business_id", businessId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      return (unwrap("listFaqs", res) ?? []) as FaqItem[];
    },

    async createFaq(businessId, input) {
      const last = await db
        .from("faq_items")
        .select("sort_order")
        .eq("business_id", businessId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const top = (unwrap("createFaq", last) as { sort_order: number } | null)?.sort_order ?? -1;

      const res = await db
        .from("faq_items")
        .insert({ business_id: businessId, ...input, sort_order: top + 1 })
        .select()
        .single();
      return unwrap("createFaq", res) as FaqItem;
    },

    async updateFaq(businessId, faqId, patch) {
      const res = await db
        .from("faq_items")
        .update(patch)
        .eq("business_id", businessId)
        .eq("id", faqId)
        .select()
        .maybeSingle();
      return unwrap("updateFaq", res) as FaqItem | null;
    },

    async deleteFaq(businessId, faqId) {
      const res = await db
        .from("faq_items")
        .delete()
        .eq("business_id", businessId)
        .eq("id", faqId)
        .select("id");
      return ((unwrap("deleteFaq", res) as unknown[] | null) ?? []).length > 0;
    },

    async listCalls(businessId, { limit, since }) {
      let query = db.from("calls").select("*").eq("business_id", businessId);
      if (since) query = query.gte("created_at", since);
      const res = await query.order("created_at", { ascending: false }).limit(limit);
      return (unwrap("listCalls", res) ?? []) as CallRecord[];
    },

    async getCall(businessId, callId) {
      const res = await db
        .from("calls")
        .select("*")
        .eq("business_id", businessId)
        .eq("id", callId)
        .maybeSingle();
      return unwrap("getCall", res) as CallRecord | null;
    },

    async upsertCall(input) {
      const res = await db.from("calls").upsert(input, { onConflict: "vapi_call_id" }).select("*").single();
      return unwrap("upsertCall", res) as CallRecord;
    },

    async saveCallAnalysis(callId, update) {
      const res = await db.from("calls").update(update).eq("id", callId);
      unwrap("saveCallAnalysis", { data: null, error: res.error });
    },

    async setFollowUp(businessId, callId, required) {
      const res = await db
        .from("calls")
        .update({ follow_up_required: required })
        .eq("business_id", businessId)
        .eq("id", callId)
        .select("*")
        .maybeSingle();
      return unwrap("setFollowUp", res) as CallRecord | null;
    },

    async claimOwnerNotification(callId, at) {
      const res = await db
        .from("calls")
        .update({ owner_notified_at: at })
        .eq("id", callId)
        .is("owner_notified_at", null)
        .select("id");
      return ((unwrap("claimOwnerNotification", res) as unknown[] | null) ?? []).length > 0;
    },

    async findAppointmentForCall(vapiCallId, startTime) {
      const res = await db
        .from("appointments")
        .select("*")
        .eq("_vapi_call_id", vapiCallId)
        .eq("start_time", startTime)
        .maybeSingle();
      return unwrap("findAppointmentForCall", res) as Appointment | null;
    },

    async insertAppointment(input) {
      const res = await db.from("appointments").insert(input).select("*").single();
      if (isUniqueViolation(res.error) && input._vapi_call_id) {
        // A concurrent retry won the race; return the row it created.
        const existing = await repo.findAppointmentForCall(input._vapi_call_id, input.start_time);
        if (existing) return existing;
      }
      return unwrap("insertAppointment", res) as Appointment;
    },

    async listAppointments(businessId, { limit }) {
      const res = await db
        .from("appointments")
        .select("*")
        .eq("business_id", businessId)
        .order("start_time", { ascending: false })
        .limit(limit);
      return (unwrap("listAppointments", res) ?? []) as Appointment[];
    },

    async listAppointmentsForVapiCall(vapiCallId) {
      const res = await db.from("appointments").select("*").eq("_vapi_call_id", vapiCallId);
      return (unwrap("listAppointmentsForVapiCall", res) ?? []) as Appointment[];
    },

    async insertMessage(input) {
      const res = await db.from("messages").insert(input).select("*").single();
      return unwrap("insertMessage", res) as Message;
    },

    async listMessages(businessId, { limit }) {
      const res = await db
        .from("messages")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (unwrap("listMessages", res) ?? []) as Message[];
    },

    async listMessagesForVapiCall(vapiCallId) {
      const res = await db.from("messages").select("*").eq("_vapi_call_id", vapiCallId);
      return (unwrap("listMessagesForVapiCall", res) ?? []) as Message[];
    },

    async setMessageRead(businessId, messageId, isRead) {
      const res = await db
        .from("messages")
        .update({ is_read: isRead })
        .eq("business_id", businessId)
        .eq("id", messageId)
        .select("id");
      return ((unwrap("setMessageRead", res) as unknown[] | null) ?? []).length > 0;
    },

    async countUnreadMessages(businessId) {
      const res = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("is_read", false);
      if (res.error) throw new RepositoryError("countUnreadMessages", res.error);
      return res.count ?? 0;
    },

    async linkCallArtifacts(vapiCallId, callId) {
      const [appts, msgs] = await Promise.all([
        db.from("appointments").update({ call_id: callId }).eq("_vapi_call_id", vapiCallId),
        db.from("messages").update({ call_id: callId }).eq("_vapi_call_id", vapiCallId),
      ]);
      unwrap("linkAppointments", { data: null, error: appts.error });
      unwrap("linkMessages", { data: null, error: msgs.error });
    },

    async ping() {
      const res = await db.from("businesses").select("id", { count: "exact", head: true }).limit(1);
      if (res.error) throw new RepositoryError("ping", res.error);
    },
  };
  return repo;
}
