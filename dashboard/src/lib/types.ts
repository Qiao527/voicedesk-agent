/** API contract with the VoiceDesk server (server/src/domain/types.ts). */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type BusinessHours = Partial<Record<Weekday, string>>;

export type CallOutcome = "appointment_booked" | "message_taken" | "transferred" | "faq_answered" | "missed" | "other";

export type Sentiment = "positive" | "neutral" | "negative";
export type Urgency = "low" | "medium" | "high";

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

export interface Call {
  id: string;
  vapi_call_id: string;
  caller_number: string | null;
  caller_name: string | null;
  status: string;
  outcome: CallOutcome | null;
  duration_seconds: number;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  sentiment: Sentiment | null;
  follow_up_required: boolean;
  analysis: CallAnalysis | null;
  cost_cents: number | null;
  ended_reason: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  call_id: string | null;
  caller_name: string;
  caller_phone: string | null;
  content: string;
  urgency: Urgency;
  is_read: boolean;
  created_at: string;
}

export interface Appointment {
  id: string;
  call_id: string | null;
  caller_name: string;
  caller_phone: string | null;
  service_type: string | null;
  start_time: string;
  end_time: string;
  duration_min: number;
  reason: string | null;
  google_event_id: string | null;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  created_at: string;
}

export interface CallDetail extends Call {
  appointments: Appointment[];
  messages: Message[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
}

export interface Business {
  id: string;
  name: string;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  address: string | null;
  timezone: string;
  business_hours: BusinessHours | null;
  greeting_message: string | null;
  recording_disclosure: string | null;
  vapi_phone_number: string | null;
  calendar_id: string | null;
  google_calendar_connected_at: string | null;
  appointment_duration_min: number;
  status: string;
}

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

export interface AnalyticsSummary {
  periodDays: number;
  totalCalls: number;
  answeredCalls: number;
  avgDurationSeconds: number;
  totalDurationSeconds: number;
  totalCostCents: number;
  afterHoursCalls: number;
  followUpsOpen: number;
  appointmentsBooked: number;
  resolutionRate: number;
  unreadMessages: number;
  outcomes: Record<CallOutcome, number>;
  sentiment: Record<Sentiment, number>;
  daily: Array<{ date: string; calls: number; booked: number }>;
}

export interface PromptPreview {
  firstMessage: string;
  systemPrompt: string;
}
