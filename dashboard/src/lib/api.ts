import { API_BASE, IS_DEMO } from "./config";
import { createDemoApi } from "./demo-api";
import { supabase } from "./supabase";
import type { AnalyticsSummary, Appointment, Business, BusinessUpdate, Call, CallDetail, FaqItem, Message, PromptPreview } from "./types";

export interface Api {
  getBusiness(): Promise<Business>;
  updateBusiness(patch: BusinessUpdate): Promise<Business>;
  getPromptPreview(): Promise<PromptPreview>;

  listCalls(): Promise<Call[]>;
  getCall(id: string): Promise<CallDetail>;
  setFollowUp(id: string, required: boolean): Promise<Call>;

  listMessages(): Promise<Message[]>;
  setMessageRead(id: string, isRead: boolean): Promise<void>;

  listAppointments(): Promise<Appointment[]>;

  listFaqs(): Promise<FaqItem[]>;
  createFaq(input: { question: string; answer: string; category?: string | null }): Promise<FaqItem>;
  updateFaq(id: string, patch: Partial<Pick<FaqItem, "question" | "answer" | "category">>): Promise<FaqItem>;
  deleteFaq(id: string): Promise<void>;

  getAnalytics(days?: number): Promise<AnalyticsSummary>;

  startCalendarConnect(): Promise<string>;
  disconnectCalendar(): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message);
  }
  return (res.headers.get("content-type")?.includes("application/json") ? res.json() : undefined) as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const httpApi: Api = {
  getBusiness: () => request("/business"),
  updateBusiness: (patch) => request("/business", json("PATCH", patch)),
  getPromptPreview: () => request("/business/prompt-preview"),

  listCalls: () => request("/calls?limit=200"),
  getCall: (id) => request(`/calls/${id}`),
  setFollowUp: (id, required) => request(`/calls/${id}`, json("PATCH", { follow_up_required: required })),

  listMessages: () => request("/messages?limit=200"),
  setMessageRead: (id, isRead) => request(`/messages/${id}`, json("PATCH", { is_read: isRead })),

  listAppointments: () => request("/appointments?limit=200"),

  listFaqs: () => request("/faqs"),
  createFaq: (input) => request("/faqs", json("POST", input)),
  updateFaq: (id, patch) => request(`/faqs/${id}`, json("PATCH", patch)),
  deleteFaq: (id) => request(`/faqs/${id}`, json("DELETE")),

  getAnalytics: (days = 30) => request(`/analytics/summary?days=${days}`),

  startCalendarConnect: async () => (await request<{ url: string }>("/auth/google/start")).url,
  disconnectCalendar: () => request("/auth/google", json("DELETE")),
};

export const api: Api = IS_DEMO ? createDemoApi() : httpApi;
