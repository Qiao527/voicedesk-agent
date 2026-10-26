/**
 * Seed the fictional "Harborview Dental" business into Supabase.
 *
 *   DEMO_OWNER_EMAIL=you@example.com DEMO_VAPI_NUMBER=+1617... npm run seed:demo
 *
 * DEMO_OWNER_EMAIL: sign up in the dashboard with this address to claim it.
 * DEMO_VAPI_NUMBER: the Vapi number that should route to this business.
 * DEMO_OWNER_PHONE: optional; enables live transfer and SMS alerts.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { DEMO_FAQS, demoBusiness } from "../demo/fixtures";
import { normalizeE164 } from "../domain/phone";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const ownerEmail = process.env.DEMO_OWNER_EMAIL;
  if (!url || !key || !ownerEmail) {
    console.error("Set SUPABASE_URL, SUPABASE_SERVICE_KEY and DEMO_OWNER_EMAIL.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const {
    id,
    created_at: _created,
    google_calendar_connected_at: _gc,
    owner_user_id: _owner,
    ...base
  } = demoBusiness();
  const row = {
    id,
    ...base,
    owner_email: ownerEmail,
    owner_phone: normalizeE164(process.env.DEMO_OWNER_PHONE) ?? null,
    vapi_phone_number: normalizeE164(process.env.DEMO_VAPI_NUMBER) ?? null,
    vapi_phone_id: process.env.DEMO_VAPI_PHONE_ID ?? null,
  };

  const { error } = await db.from("businesses").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`businesses: ${error.message}`);

  await db.from("faq_items").delete().eq("business_id", id);
  const { error: faqError } = await db
    .from("faq_items")
    .insert(DEMO_FAQS.map(({ id: _faqId, created_at: _c, ...f }) => f));
  if (faqError) throw new Error(`faq_items: ${faqError.message}`);

  console.log(`Seeded ${row.name} (${id}) with ${DEMO_FAQS.length} FAQs.`);
  console.log(
    row.vapi_phone_number
      ? `Calls to ${row.vapi_phone_number} now reach it.`
      : "Set DEMO_VAPI_NUMBER to route a real number to it.",
  );
  console.log(`Sign up in the dashboard as ${ownerEmail} to claim it.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
