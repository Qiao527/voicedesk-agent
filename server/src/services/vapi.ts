import { env } from "../config/env";

const VAPI_BASE = "https://api.vapi.ai";

async function vapiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vapi API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Phone Numbers ───────────────────────────────────────────────────

interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
  serverUrl?: string;
}

export async function buyPhoneNumber(params: {
  areaCode?: string;
  serverUrl: string;
}): Promise<VapiPhoneNumber> {
  return vapiRequest<VapiPhoneNumber>("/phone-number", {
    method: "POST",
    body: {
      provider: "vapi",
      numberDesiredAreaCode: params.areaCode,
      serverUrl: params.serverUrl,
    },
  });
}

export async function importPhoneNumber(params: {
  provider: "twilio" | "vonage";
  number: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  serverUrl: string;
}): Promise<VapiPhoneNumber> {
  return vapiRequest<VapiPhoneNumber>("/phone-number", {
    method: "POST",
    body: {
      provider: params.provider,
      number: params.number,
      twilioAccountSid: params.twilioAccountSid,
      twilioAuthToken: params.twilioAuthToken,
      serverUrl: params.serverUrl,
    },
  });
}

export async function updatePhoneNumber(
  phoneId: string,
  updates: { serverUrl?: string; assistantId?: string | null },
): Promise<VapiPhoneNumber> {
  return vapiRequest<VapiPhoneNumber>(`/phone-number/${phoneId}`, {
    method: "PATCH",
    body: updates,
  });
}

export async function listPhoneNumbers(): Promise<VapiPhoneNumber[]> {
  return vapiRequest<VapiPhoneNumber[]>("/phone-number");
}

export async function deletePhoneNumber(phoneId: string): Promise<void> {
  await vapiRequest(`/phone-number/${phoneId}`, { method: "DELETE" });
}

// ─── Assistants ──────────────────────────────────────────────────────
// We use dynamic assistant-request webhooks in production (per-business config).
// These functions are for creating a static assistant for testing/demo purposes.

interface VapiAssistant {
  id: string;
  name: string;
  model: unknown;
  voice: unknown;
}

export async function createAssistant(params: {
  name: string;
  systemPrompt: string;
  greeting: string;
  voiceId?: string;
  tools?: unknown[];
}): Promise<VapiAssistant> {
  return vapiRequest<VapiAssistant>("/assistant", {
    method: "POST",
    body: {
      name: params.name,
      model: {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "system", content: params.systemPrompt }],
      },
      voice: {
        provider: "11labs",
        voiceId: params.voiceId || "paula",
      },
      firstMessage: params.greeting,
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
      recordingEnabled: true,
      endCallFunctionEnabled: true,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
      ...(params.tools ? { functions: params.tools } : {}),
    },
  });
}

export async function deleteAssistant(assistantId: string): Promise<void> {
  await vapiRequest(`/assistant/${assistantId}`, { method: "DELETE" });
}

// ─── Calls (read-only, for debugging) ────────────────────────────────

interface VapiCall {
  id: string;
  status: string;
  duration: number;
  createdAt: string;
}

export async function getCall(callId: string): Promise<VapiCall> {
  return vapiRequest<VapiCall>(`/call/${callId}`);
}

export async function listCalls(limit = 20): Promise<VapiCall[]> {
  return vapiRequest<VapiCall[]>(`/call?limit=${limit}`);
}
