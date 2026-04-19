import { supabase } from "./supabase";

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
  };
  const extra = (options?.headers as Record<string, string> | undefined) ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...baseHeaders, ...extra },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  // PATCH endpoints may return 204 / empty body.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// ─── Calls ───────────────────────────────────────────────────────────

export interface Call {
  id: string;
  vapi_call_id: string;
  caller_number: string;
  caller_name: string | null;
  direction: string;
  status: string;
  outcome: string | null;
  duration_seconds: number;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  sentiment: string | null;
  cost_cents: number | null;
  created_at: string;
}

export function fetchCalls(): Promise<Call[]> {
  return request<Call[]>("/calls");
}

// ─── Messages ────────────────────────────────────────────────────────

export interface Message {
  id: string;
  business_id: string | null;
  caller_name: string;
  caller_phone: string | null;
  content: string;
  urgency: "low" | "medium" | "high";
  is_read: boolean;
  created_at: string;
}

export function fetchMessages(): Promise<Message[]> {
  return request<Message[]>("/messages");
}

export function markMessageRead(id: string): Promise<void> {
  return request<void>(`/messages/${id}/read`, { method: "PATCH" });
}

// ─── FAQs ────────────────────────────────────────────────────────────

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
}

export function fetchFaqs(): Promise<FaqItem[]> {
  return request<FaqItem[]>("/faqs");
}

export function createFaq(faq: {
  question: string;
  answer: string;
  category?: string;
}): Promise<FaqItem> {
  return request<FaqItem>("/faqs", {
    method: "POST",
    body: JSON.stringify(faq),
  });
}

export function deleteFaq(id: string): Promise<void> {
  return request<void>(`/faqs/${id}`, { method: "DELETE" });
}

// ─── Appointments ────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  business_id: string | null;
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
  status: string;
  created_at: string;
}

export function fetchAppointments(): Promise<Appointment[]> {
  return request<Appointment[]>("/appointments");
}

// ─── Analytics ───────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalCalls: number;
  avgDurationSeconds: number;
  totalDurationSeconds: number;
  unreadMessages: number;
  appointmentCount: number;
  period: string;
}

export interface DailyCallCount {
  date: string;
  count: number;
}

export function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>("/analytics/summary");
}

export function fetchDailyCalls(): Promise<DailyCallCount[]> {
  return request<DailyCallCount[]>("/analytics/daily-calls");
}

// ─── Business ────────────────────────────────────────────────────────

export interface Business {
  id: string;
  name: string;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  address: string | null;
  timezone: string;
  business_hours: Record<string, string>;
  greeting_message: string | null;
  recording_disclosure: string | null;
  vapi_phone_number: string | null;
  calendar_id: string | null;
  google_calendar_connected_at: string | null;
  status: string;
}

export function fetchBusiness(): Promise<Business> {
  return request<Business>("/business");
}

export function updateBusiness(
  updates: Partial<Business>,
): Promise<Business> {
  return request<Business>("/business", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/**
 * Kick off the Google Calendar OAuth flow. The start endpoint is
 * authenticated server-side (the caller's businessId is resolved from the
 * Supabase session, not from any client-supplied value), so we fetch the
 * signed Google URL with the bearer token and then redirect the browser.
 */
export async function startGoogleCalendarConnect(): Promise<void> {
  const { url } = await request<{ url: string }>("/auth/google/start");
  window.location.href = url;
}
