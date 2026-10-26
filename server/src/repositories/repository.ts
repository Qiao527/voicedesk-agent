import type {
  Appointment,
  AppointmentInsert,
  Business,
  BusinessUpdate,
  CallAnalysisUpdate,
  CallerHistory,
  CallRecord,
  CallUpsert,
  FaqItem,
  Message,
  MessageInsert,
} from "../domain/types";

export interface FaqInput {
  question: string;
  answer: string;
  category: string | null;
}

/**
 * Persistence boundary. Route handlers and the webhook pipeline only talk to
 * this interface, which keeps them testable with the in-memory implementation
 * and keeps every query scoped by `businessId` in one place.
 */
export interface Repository {
  // ─── Businesses ────────────────────────────────────────────────────
  getBusiness(businessId: string): Promise<Business | null>;
  findBusinessByVapiNumber(phoneNumber: string): Promise<Business | null>;
  findBusinessByVapiPhoneId(phoneId: string): Promise<Business | null>;
  /**
   * Resolve the business a dashboard user owns. May claim an unclaimed business
   * by an exact, case-insensitive `owner_email` match — but only for a verified
   * email, so controlling a look-alike or unconfirmed address cannot take over
   * another tenant.
   */
  findBusinessIdForUser(user: {
    id: string;
    email: string | null;
    emailVerified: boolean;
  }): Promise<string | null>;
  updateBusiness(businessId: string, patch: BusinessUpdate): Promise<Business | null>;
  getCalendarTokens(businessId: string): Promise<unknown>;
  saveCalendarTokens(businessId: string, tokens: unknown, connectedAt: string): Promise<void>;
  clearCalendarTokens(businessId: string): Promise<void>;

  // ─── FAQ ───────────────────────────────────────────────────────────
  listFaqs(businessId: string): Promise<FaqItem[]>;
  createFaq(businessId: string, input: FaqInput): Promise<FaqItem>;
  updateFaq(businessId: string, faqId: string, patch: Partial<FaqInput>): Promise<FaqItem | null>;
  deleteFaq(businessId: string, faqId: string): Promise<boolean>;

  // ─── Calls ─────────────────────────────────────────────────────────
  listCalls(businessId: string, options: { limit: number; since?: string }): Promise<CallRecord[]>;
  getCall(businessId: string, callId: string): Promise<CallRecord | null>;
  /**
   * What the business remembers about a phone number from its earlier calls and
   * appointments. Powers the returning-caller greeting and the dashboard's
   * caller context. Returns null when the number is new to the business.
   */
  getCallerHistory(
    businessId: string,
    callerNumber: string,
    now: Date,
  ): Promise<CallerHistory | null>;
  /** Idempotent on `vapi_call_id`: Vapi retries end-of-call reports. */
  upsertCall(input: CallUpsert): Promise<CallRecord>;
  saveCallAnalysis(callId: string, update: CallAnalysisUpdate): Promise<void>;
  setFollowUp(businessId: string, callId: string, required: boolean): Promise<CallRecord | null>;
  /**
   * Atomically mark the owner as notified. Returns false if another delivery
   * of the same webhook already claimed it, so the owner gets one SMS per call.
   */
  claimOwnerNotification(callId: string, at: string): Promise<boolean>;

  // ─── Appointments ──────────────────────────────────────────────────
  findAppointmentForCall(vapiCallId: string, startTime: string): Promise<Appointment | null>;
  insertAppointment(input: AppointmentInsert): Promise<Appointment>;
  listAppointments(businessId: string, options: { limit: number }): Promise<Appointment[]>;
  listAppointmentsForVapiCall(vapiCallId: string): Promise<Appointment[]>;

  // ─── Messages ──────────────────────────────────────────────────────
  insertMessage(input: MessageInsert): Promise<Message>;
  listMessages(businessId: string, options: { limit: number }): Promise<Message[]>;
  listMessagesForVapiCall(vapiCallId: string): Promise<Message[]>;
  setMessageRead(businessId: string, messageId: string, isRead: boolean): Promise<boolean>;
  countUnreadMessages(businessId: string): Promise<number>;

  /** Attach appointments/messages created mid-call to the final call row. */
  linkCallArtifacts(vapiCallId: string, callId: string): Promise<void>;

  /** Cheap round-trip used by the health check. */
  ping(): Promise<void>;
}
