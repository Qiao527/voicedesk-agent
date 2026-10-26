import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    /** Express `trust proxy` setting; 1 = one hop (Railway, Render, Fly). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),

    /** Comma-separated list of dashboard origins allowed by CORS. */
    DASHBOARD_URL: z.string().default("http://localhost:5173"),

    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_KEY: z.string().min(1),

    /** Shared secret Vapi sends with every webhook. Required in production. */
    VAPI_WEBHOOK_SECRET: optional,
    /** Only needed by the onboarding CLI to buy numbers; the server never calls Vapi. */
    VAPI_API_KEY: optional,

    VOICE_MODEL: z.string().default("claude-haiku-5-5"),
    VOICE_PROVIDER: z.string().default("vapi"),
    VOICE_ID: z.string().default("Clara"),

    ANTHROPIC_API_KEY: optional,
    ANALYSIS_MODEL: z.string().default("claude-haiku-5-5"),

    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    GOOGLE_REDIRECT_URI: optional,
    /** 32-byte key (base64 or hex) for encrypting Google tokens at rest. */
    TOKEN_ENCRYPTION_KEY: optional,
    /** HMAC key for OAuth state. Falls back to SUPABASE_SERVICE_KEY. */
    OAUTH_STATE_SECRET: optional,

    TWILIO_ACCOUNT_SID: optional,
    TWILIO_AUTH_TOKEN: optional,
    TWILIO_PHONE_NUMBER: optional,

    RESEND_API_KEY: optional,
    NOTIFICATION_FROM_EMAIL: optional,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.VAPI_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["VAPI_WEBHOOK_SECRET"],
        message: "is required in production. Without it anyone can post fake calls to /webhooks/vapi.",
      });
    }
    if (env.NODE_ENV === "production" && env.GOOGLE_CLIENT_ID && !env.TOKEN_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "is required in production when Google Calendar is enabled.",
      });
    }
    if (env.RESEND_API_KEY && !env.NOTIFICATION_FROM_EMAIL) {
      ctx.addIssue({
        code: "custom",
        path: ["NOTIFICATION_FROM_EMAIL"],
        message: "is required when RESEND_API_KEY is set (use an address on a domain verified in Resend).",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/** Parse and validate configuration. Pure: pass `process.env` or a test fixture. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"} ${issue.message}`),
    );
  }
  return result.data;
}

export function allowedOrigins(env: Pick<Env, "DASHBOARD_URL">): string[] {
  return env.DASHBOARD_URL.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}
