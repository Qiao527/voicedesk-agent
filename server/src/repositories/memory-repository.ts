import { randomUUID } from "node:crypto";
import { normalizeEmail } from "../domain/email";
import type { Appointment, Business, CallRecord, FaqItem, Message } from "../domain/types";
import type { Repository } from "./repository";

export interface MemoryState {
  businesses: Array<Business & { google_calendar_tokens?: unknown }>;
  faqs: FaqItem[];
  calls: CallRecord[];
  appointments: Appointment[];
  messages: Message[];
}

const clone = <T>(value: T): T => structuredClone(value);
const byNewest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);

/**
 * In-memory repository with the same semantics as the Supabase one,
 * including the unique constraints the webhook pipeline relies on for
 * idempotency. Used by the test suite and by `npm run demo:call`.
 */
export function createMemoryRepository(seed: Partial<MemoryState> = {}) {
  const state: MemoryState = {
    businesses: clone(seed.businesses ?? []),
    faqs: clone(seed.faqs ?? []),
    calls: clone(seed.calls ?? []),
    appointments: clone(seed.appointments ?? []),
    messages: clone(seed.messages ?? []),
  };
  const now = () => new Date().toISOString();
  const publicBusiness = (b: MemoryState["businesses"][number] | undefined) => {
    if (!b) return null;
    const { google_calendar_tokens: _tokens, ...rest } = b;
    return clone(rest) as Business;
  };

  const repo: Repository = {
    async getBusiness(id) {
      return publicBusiness(state.businesses.find((b) => b.id === id));
    },
    async findBusinessByVapiNumber(number) {
      return publicBusiness(
        state.businesses.find((b) => b.vapi_phone_number === number && b.status === "active"),
      );
    },
    async findBusinessByVapiPhoneId(phoneId) {
      return publicBusiness(
        state.businesses.find((b) => b.vapi_phone_id === phoneId && b.status === "active"),
      );
    },
    async findBusinessIdForUser(user) {
      const owned = state.businesses.find((b) => b.owner_user_id === user.id);
      if (owned) return owned.id;
      if (!user.email || !user.emailVerified) return null;
      const email = normalizeEmail(user.email);
      const unclaimed = state.businesses.find(
        (b) => !b.owner_user_id && b.owner_email && normalizeEmail(b.owner_email) === email,
      );
      if (!unclaimed) return null;
      unclaimed.owner_user_id = user.id;
      return unclaimed.id;
    },
    async updateBusiness(id, patch) {
      const biz = state.businesses.find((b) => b.id === id);
      if (!biz) return null;
      Object.assign(biz, clone(patch));
      return publicBusiness(biz);
    },
    async getCalendarTokens(id) {
      return clone(state.businesses.find((b) => b.id === id)?.google_calendar_tokens ?? null);
    },
    async saveCalendarTokens(id, tokens, connectedAt) {
      const biz = state.businesses.find((b) => b.id === id);
      if (biz) {
        biz.google_calendar_tokens = clone(tokens);
        biz.google_calendar_connected_at = connectedAt;
      }
    },
    async clearCalendarTokens(id) {
      const biz = state.businesses.find((b) => b.id === id);
      if (biz) {
        biz.google_calendar_tokens = null;
        biz.google_calendar_connected_at = null;
      }
    },

    async listFaqs(businessId) {
      return clone(
        state.faqs.filter((f) => f.business_id === businessId).sort((a, b) => a.sort_order - b.sort_order),
      );
    },
    async createFaq(businessId, input) {
      const order = state.faqs.filter((f) => f.business_id === businessId).length;
      const faq: FaqItem = {
        id: randomUUID(),
        business_id: businessId,
        ...input,
        sort_order: order,
        created_at: now(),
      };
      state.faqs.push(faq);
      return clone(faq);
    },
    async updateFaq(businessId, faqId, patch) {
      const faq = state.faqs.find((f) => f.business_id === businessId && f.id === faqId);
      if (!faq) return null;
      Object.assign(faq, patch);
      return clone(faq);
    },
    async deleteFaq(businessId, faqId) {
      const before = state.faqs.length;
      state.faqs = state.faqs.filter((f) => !(f.business_id === businessId && f.id === faqId));
      return state.faqs.length < before;
    },

    async listCalls(businessId, { limit, since }) {
      return clone(
        state.calls
          .filter((c) => c.business_id === businessId && (!since || c.created_at >= since))
          .sort(byNewest)
          .slice(0, limit),
      );
    },
    async getCall(businessId, callId) {
      return clone(state.calls.find((c) => c.business_id === businessId && c.id === callId) ?? null);
    },
    async upsertCall(input) {
      const existing = state.calls.find((c) => c.vapi_call_id === input.vapi_call_id);
      if (existing) {
        Object.assign(existing, clone(input));
        return clone(existing);
      }
      const call: CallRecord = {
        id: randomUUID(),
        caller_name: null,
        sentiment: null,
        follow_up_required: false,
        analysis: null,
        owner_notified_at: null,
        created_at: now(),
        ...clone(input),
      };
      state.calls.push(call);
      return clone(call);
    },
    async saveCallAnalysis(callId, update) {
      const call = state.calls.find((c) => c.id === callId);
      if (call) Object.assign(call, clone(update));
    },
    async setFollowUp(businessId, callId, required) {
      const call = state.calls.find((c) => c.business_id === businessId && c.id === callId);
      if (!call) return null;
      call.follow_up_required = required;
      return clone(call);
    },
    async claimOwnerNotification(callId, at) {
      const call = state.calls.find((c) => c.id === callId);
      if (!call || call.owner_notified_at) return false;
      call.owner_notified_at = at;
      return true;
    },

    async findAppointmentForCall(vapiCallId, startTime) {
      return clone(
        state.appointments.find((a) => a._vapi_call_id === vapiCallId && a.start_time === startTime) ?? null,
      );
    },
    async insertAppointment(input) {
      const dup = input._vapi_call_id
        ? state.appointments.find(
            (a) => a._vapi_call_id === input._vapi_call_id && a.start_time === input.start_time,
          )
        : undefined;
      if (dup) return clone(dup);
      const appt: Appointment = {
        id: randomUUID(),
        call_id: null,
        notes: null,
        created_at: now(),
        ...clone(input),
      };
      state.appointments.push(appt);
      return clone(appt);
    },
    async listAppointments(businessId, { limit }) {
      return clone(
        state.appointments
          .filter((a) => a.business_id === businessId)
          .sort((a, b) => b.start_time.localeCompare(a.start_time))
          .slice(0, limit),
      );
    },
    async listAppointmentsForVapiCall(vapiCallId) {
      return clone(state.appointments.filter((a) => a._vapi_call_id === vapiCallId));
    },

    async insertMessage(input) {
      const msg: Message = {
        id: randomUUID(),
        call_id: null,
        is_read: false,
        created_at: now(),
        ...clone(input),
      };
      state.messages.push(msg);
      return clone(msg);
    },
    async listMessages(businessId, { limit }) {
      return clone(
        state.messages
          .filter((m) => m.business_id === businessId)
          .sort(byNewest)
          .slice(0, limit),
      );
    },
    async listMessagesForVapiCall(vapiCallId) {
      return clone(state.messages.filter((m) => m._vapi_call_id === vapiCallId));
    },
    async setMessageRead(businessId, messageId, isRead) {
      const msg = state.messages.find((m) => m.business_id === businessId && m.id === messageId);
      if (!msg) return false;
      msg.is_read = isRead;
      return true;
    },
    async countUnreadMessages(businessId) {
      return state.messages.filter((m) => m.business_id === businessId && !m.is_read).length;
    },
    async linkCallArtifacts(vapiCallId, callId) {
      for (const a of state.appointments) if (a._vapi_call_id === vapiCallId) a.call_id = callId;
      for (const m of state.messages) if (m._vapi_call_id === vapiCallId) m.call_id = callId;
    },
    async ping() {},
  };

  return { repo, state };
}
