/**
 * Core domain types shared by the webhook pipeline, the dashboard API and the
 * persistence layer. Column names intentionally mirror `supabase/schema.sql`
 * so rows can flow between layers without a mapping step.
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** e.g. `{ mon: "9:00-17:00", sat: "closed" }`. Missing keys mean closed. */
export type BusinessHours = Partial<Record<Weekday, string>>;

export interface Business {
  id: string;
  name: string;
  phone: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  address: string | null;
  vapi_phone_number: string | null;
  vapi_phone_id: string | null;
  calendar_id: string | null;
  google_calendar_connected_at: string | null;
  timezone: string;
  business_hours: BusinessHours | null;
  greeting_message: string | null;
  recording_disclosure: string | null;
  system_prompt_override: string | null;
  appointment_duration_min: number;
  status: string;
  created_at: string;
}

/** Fields the dashboard may read. Excludes OAuth tokens and internal ids. */
export type PublicBusiness = Pick<
  Business,
  | "id"
  | "name"
  | "owner_name"
  | "owner_phone"
  | "owner_email"
  | "address"
  | "timezone"
  | "business_hours"
  | "greeting_message"
  | "recording_disclosure"
  | "vapi_phone_number"
  | "calendar_id"
  | "google_calendar_connected_at"
  | "appointment_duration_min"
  | "status"
>;

export type BusinessUpdate = Partial<
  Pick<
    Business,
    | "name"
    | "owner_name"
    | "owner_phone"
    | "owner_email"
    | "address"
    | "timezone"
    | "business_hours"
    | "greeting_message"
    | "recording_disclosure"
    | "appointment_duration_min"
  >
>;

export interface FaqItem {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
  created_at: string;
}

export const CALL_OUTCOMES = [
  "appointment_booked",
  "message_taken",
  "transferred",
  "faq_answered",
  "missed",
  "other",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

/** Structured post-call analysis produced by the call analyzer. */
export interface CallAnalysis {
  summary: string;
  sentiment: Sentiment;
  caller_name: string | null;
  intent: string;
  questions_answered: boolean;
  follow_up_required: boolean;
  follow_up_reason: string | null;
  topics: string[];
}

export interface CallRecord {
  id: string;
  business_id: string | null;
  vapi_call_id: string;
  caller_number: string | null;
  caller_name: string | null;
  direction: string;
  status: string;
  duration_seconds: number;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  outcome: CallOutcome | null;
  sentiment: Sentiment | null;
  follow_up_required: boolean;
  analysis: CallAnalysis | null;
  cost_cents: number | null;
  ended_reason: string | null;
  owner_notified_at: string | null;
  created_at: string;
}

export type CallUpsert = Pick<
  CallRecord,
  | "business_id"
  | "vapi_call_id"
  | "caller_number"
  | "direction"
  | "status"
  | "duration_seconds"
  | "summary"
  | "transcript"
  | "recording_url"
  | "ended_reason"
  | "outcome"
  | "cost_cents"
>;

export type CallAnalysisUpdate = Pick<
  CallRecord,
  "caller_name" | "sentiment" | "follow_up_required" | "analysis" | "summary" | "outcome"
>;

export type AppointmentStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export interface Appointment {
  id: string;
  business_id: string;
  call_id: string | null;
  caller_name: string;
  caller_phone: string | null;
  service_type: string | null;
  start_time: string;
  end_time: string;
  duration_min: number;
  reason: string | null;
  notes: string | null;
  google_event_id: string | null;
  status: AppointmentStatus;
  _vapi_call_id: string | null;
  created_at: string;
}

export type AppointmentInsert = Omit<Appointment, "id" | "created_at" | "call_id" | "notes">;

export type Urgency = "low" | "medium" | "high";

export interface Message {
  id: string;
  business_id: string | null;
  call_id: string | null;
  caller_name: string;
  caller_phone: string | null;
  content: string;
  urgency: Urgency;
  is_read: boolean;
  _vapi_call_id: string | null;
  created_at: string;
}

export type MessageInsert = Omit<Message, "id" | "created_at" | "call_id" | "is_read">;

/** A past or upcoming visit, as remembered for a returning caller. */
export interface CallerVisit {
  start_time: string;
  reason: string | null;
  status: AppointmentStatus;
}

/**
 * What VoiceDesk remembers about a phone number that has reached a business
 * before. Used to greet returning callers by name and to surface prior context
 * in the dashboard. It is derived at read time from the existing `calls` and
 * `appointments` rows — there is no separate memory store. `null` means the
 * number is new to this business.
 */
export interface CallerHistory {
  caller_number: string;
  caller_name: string | null;
  /** Earlier calls from this number held by the business right now. */
  call_count: number;
  last_call_at: string | null;
  last_outcome: CallOutcome | null;
  upcoming_appointment: CallerVisit | null;
  last_visit: CallerVisit | null;
}
