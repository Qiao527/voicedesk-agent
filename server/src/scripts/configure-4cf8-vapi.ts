/**
 * One-off: buy a Vapi phone number and attach it to the existing 4cf8 business.
 *
 * Why one-off: setup-business CLI creates a NEW business row. We already have
 * the 4cf8 row with Google Calendar connected — we just need Vapi on it.
 *
 * What it does:
 *   1. Buys a Vapi phone number (US, area code 857 by default).
 *   2. Points the number's server webhook at the deployed Railway URL
 *      and sets the server-url secret so signature verification works.
 *   3. Writes vapi_phone_number + vapi_phone_id onto the 4cf8 row.
 *
 * Requires env (local .env is fine — we call Vapi + Supabase directly):
 *   VAPI_API_KEY
 *   VAPI_WEBHOOK_SECRET      (MUST match what's set on the Railway server)
 *   SUPABASE_URL / SUPABASE_SERVICE_KEY
 *
 * Usage:
 *   cd server && npx ts-node src/scripts/configure-4cf8-vapi.ts
 *
 * Safety:
 *   - Skips phone purchase if vapi_phone_id is already set (re-run-safe).
 *   - Costs ~$2/month for the number. Confirm Vapi credit before running.
 */

import "dotenv/config";
import "../config/env";
import { supabase } from "../services/supabase";

const BUSINESS_ID = "00000000-0000-4000-8000-000000000000";
const AREA_CODE = "857";
const SERVER_URL = "https://your-server.example.com/webhooks/vapi";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

if (!VAPI_API_KEY || !VAPI_WEBHOOK_SECRET) {
  console.error("VAPI_API_KEY and VAPI_WEBHOOK_SECRET must both be set.");
  process.exit(1);
}

async function vapi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi ${res.status} ${path}: ${text}`);
  return JSON.parse(text) as T;
}

async function main() {
  const { data: biz, error } = await supabase
    .from("businesses")
    .select("id, name, vapi_phone_number, vapi_phone_id, google_calendar_connected_at, owner_phone")
    .eq("id", BUSINESS_ID)
    .single();
  if (error) throw error;
  if (!biz) throw new Error(`Business ${BUSINESS_ID} not found`);

  console.log("Target business:");
  console.log(`  name: ${biz.name}`);
  console.log(`  owner_phone: ${biz.owner_phone}`);
  console.log(`  google_calendar_connected_at: ${biz.google_calendar_connected_at}`);
  console.log(`  current vapi_phone_number: ${biz.vapi_phone_number ?? "<none>"}`);
  console.log(`  current vapi_phone_id: ${biz.vapi_phone_id ?? "<none>"}`);
  console.log();

  if (biz.vapi_phone_id) {
    console.log("Already has a Vapi phone. Updating serverUrl/secret in place (no purchase).");
    const updated = await vapi<{ id: string; number: string }>(
      `/phone-number/${biz.vapi_phone_id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          server: { url: SERVER_URL, secret: VAPI_WEBHOOK_SECRET },
        }),
      }
    );
    console.log(`Updated phone ${updated.number} (id ${updated.id}).`);
    return;
  }

  console.log(`Buying a Vapi number in area code ${AREA_CODE}...`);
  console.log(`  serverUrl = ${SERVER_URL}`);
  const bought = await vapi<{ id: string; number: string }>("/phone-number", {
    method: "POST",
    body: JSON.stringify({
      provider: "vapi",
      numberDesiredAreaCode: AREA_CODE,
      server: { url: SERVER_URL, secret: VAPI_WEBHOOK_SECRET },
    }),
  });
  console.log(`Bought ${bought.number} (id ${bought.id}).`);

  const { error: updateErr } = await supabase
    .from("businesses")
    .update({
      vapi_phone_number: bought.number,
      vapi_phone_id: bought.id,
    })
    .eq("id", BUSINESS_ID);
  if (updateErr) {
    console.error("Failed to save phone to business row:", updateErr.message);
    console.error("Manual fix: update business row with:");
    console.error(`  vapi_phone_number=${bought.number}`);
    console.error(`  vapi_phone_id=${bought.id}`);
    process.exit(1);
  }

  console.log("\nDone. The 4cf8 business can now receive calls at this number.");
  console.log(`Dial ${bought.number} to test the flow.`);
}

main().catch((e) => {
  console.error("configure-4cf8-vapi failed:", e);
  process.exit(2);
});
