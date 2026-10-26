/**
 * Thin Vapi REST client used by the onboarding CLI. The running server never
 * calls Vapi: calls are configured per request through `assistant-request`.
 */

const VAPI_BASE = "https://api.vapi.ai";

export interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
}

export function createVapiClient(apiKey: string) {
  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(`${VAPI_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok)
      throw new Error(`Vapi ${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    /**
     * Buy a Vapi-provisioned US number and point it at our webhook. The
     * secret is sent by Vapi on every server message as `X-Vapi-Secret`.
     */
    buyPhoneNumber(params: { areaCode?: string; serverUrl: string; secret?: string; name?: string }) {
      return request<VapiPhoneNumber>("/phone-number", {
        method: "POST",
        body: {
          provider: "vapi",
          name: params.name,
          numberDesiredAreaCode: params.areaCode,
          server: {
            url: params.serverUrl,
            ...(params.secret ? { headers: { "X-Vapi-Secret": params.secret } } : {}),
          },
        },
      });
    },

    updatePhoneNumberServer(phoneId: string, params: { serverUrl: string; secret?: string }) {
      return request<VapiPhoneNumber>(`/phone-number/${phoneId}`, {
        method: "PATCH",
        body: {
          server: {
            url: params.serverUrl,
            ...(params.secret ? { headers: { "X-Vapi-Secret": params.secret } } : {}),
          },
        },
      });
    },

    listPhoneNumbers() {
      return request<VapiPhoneNumber[]>("/phone-number");
    },
  };
}
