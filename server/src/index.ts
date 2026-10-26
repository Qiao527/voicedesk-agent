import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app";
import { allowedOrigins, ConfigError, loadEnv } from "./config/env";
import { createLogger, serializeError } from "./lib/logger";
import { createSupabaseRepository } from "./repositories/supabase-repository";
import { createGoogleCalendar } from "./services/calendar";
import { createClaudeAnalyzer } from "./services/call-analyzer";
import { createNotifier } from "./services/notifier";
import { createOAuthStateSigner } from "./services/oauth-state";
import { createTokenCipher } from "./services/token-cipher";

const version = process.env.npm_package_version ?? "dev";

function main() {
  let env;
  try {
    env = loadEnv(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger({
    format: env.NODE_ENV === "production" ? "json" : "pretty",
    level: env.LOG_LEVEL,
    base: { service: "voicedesk-server" },
  });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repo = createSupabaseRepository(supabase);
  const cipher = createTokenCipher(env.TOKEN_ENCRYPTION_KEY);
  const google = createGoogleCalendar({
    config: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    },
    repo,
    cipher,
    logger,
  });
  const origins = allowedOrigins(env);

  const app = createApp({
    version,
    allowedOrigins: origins,
    trustProxy: env.TRUST_PROXY,
    vapiWebhookSecret: env.VAPI_WEBHOOK_SECRET,
    pipeline: {
      repo,
      calendar: google.oauth.configured ? google.provider : null,
      notifier: createNotifier(
        {
          twilioAccountSid: env.TWILIO_ACCOUNT_SID,
          twilioAuthToken: env.TWILIO_AUTH_TOKEN,
          twilioFrom: env.TWILIO_PHONE_NUMBER,
          resendApiKey: env.RESEND_API_KEY,
          emailFrom: env.NOTIFICATION_FROM_EMAIL,
        },
        logger,
      ),
      analyzer: env.ANTHROPIC_API_KEY
        ? createClaudeAnalyzer({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANALYSIS_MODEL, logger })
        : null,
      logger,
      voice: { model: env.VOICE_MODEL, voiceProvider: env.VOICE_PROVIDER, voiceId: env.VOICE_ID },
      dashboardUrl: origins[0] ?? null,
      now: () => new Date(),
      background: (label, task) => {
        task().catch((err) => logger.error("background.failed", { task: label, ...serializeError(err) }));
      },
    },
    api: {
      verifyToken: async (token) => {
        const { data, error } = await supabase.auth.getUser(token);
        return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
      },
      calendarOAuth: google.oauth,
      oauthState: createOAuthStateSigner(env.OAUTH_STATE_SECRET ?? env.SUPABASE_SERVICE_KEY),
      dashboardUrl: origins[0] ?? "http://localhost:5173",
    },
  });

  if (!env.VAPI_WEBHOOK_SECRET) {
    logger.warn("startup.webhook_auth_disabled", {
      hint: "Set VAPI_WEBHOOK_SECRET before exposing this server",
    });
  }
  if (!cipher.enabled && google.oauth.configured) {
    logger.warn("startup.tokens_unencrypted", {
      hint: "Set TOKEN_ENCRYPTION_KEY to encrypt Google tokens at rest",
    });
  }

  const server = app.listen(env.PORT, () => {
    logger.info("startup.listening", {
      port: env.PORT,
      env: env.NODE_ENV,
      version,
      voiceModel: env.VOICE_MODEL,
      analysis: env.ANTHROPIC_API_KEY ? env.ANALYSIS_MODEL : "disabled",
    });
  });

  // Let in-flight webhooks finish when the platform sends SIGTERM on deploy.
  const shutdown = (signal: string) => {
    logger.info("shutdown.start", { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
