import "dotenv/config";
import { env } from "./config/env";
import express, { Request } from "express";
import cors from "cors";
import { verifyVapiSignature } from "./middleware/verify-vapi-signature";
import { vapiWebhookRouter } from "./routes/vapi-webhook";
import { apiRouter } from "./routes/api";
import { supabase } from "./services/supabase";

const app = express();

app.use(cors({ origin: env.DASHBOARD_URL }));
// Capture the raw request body so Vapi webhook HMAC verification can hash the
// exact bytes Vapi signed. Re-serializing req.body with JSON.stringify does not
// reliably reproduce those bytes (key order, whitespace, unicode escaping).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  })
);

app.get("/ping", (_req, res) => res.json({ status: "ok" }));

app.use("/webhooks/vapi", verifyVapiSignature, vapiWebhookRouter);
app.use("/api", apiRouter);

// Real healthcheck: return 200 only if we can actually reach Supabase.
// Uptime monitors will catch a broken service_role key or network partition.
app.get("/health", async (_req, res) => {
  const started = Date.now();
  try {
    const { error } = await supabase
      .from("businesses")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) throw error;
    res.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      status: "degraded",
      db: "error",
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.listen(env.PORT, () => {
  console.log(`VoiceDesk server listening on port ${env.PORT}`);
});
