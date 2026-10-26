/**
 * Onboard a new business: collect details, optionally buy a Vapi number
 * pointed at this server, create the Supabase row and seed starter FAQs.
 *
 *   npm run setup
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { normalizeE164 } from "../domain/phone";
import { isValidTimeZone, parseHoursRange } from "../domain/time";
import { WEEKDAYS, type BusinessHours } from "../domain/types";
import { createVapiClient } from "../services/vapi-client";

const DEFAULT_HOURS: BusinessHours = {
  mon: "9:00-17:00",
  tue: "9:00-17:00",
  wed: "9:00-17:00",
  thu: "9:00-17:00",
  fri: "9:00-17:00",
  sat: "closed",
  sun: "closed",
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_KEY"), {
    auth: { persistSession: false },
  });
  const rl = readline.createInterface({ input, output });
  const ask = async (question: string, fallback = "") => {
    const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
    return answer || fallback;
  };

  console.log("\nVoiceDesk · new business setup\n");

  const name = await ask("Business name");
  if (!name) throw new Error("Business name is required");

  const ownerName = await ask("Owner name");
  const ownerPhoneRaw = await ask("Owner mobile (SMS alerts + live transfer), e.g. +16175551234");
  const ownerPhone = ownerPhoneRaw ? normalizeE164(ownerPhoneRaw) : null;
  if (ownerPhoneRaw && !ownerPhone) throw new Error(`"${ownerPhoneRaw}" is not a valid phone number`);

  const ownerEmail = await ask("Owner email (used to sign in to the dashboard)");
  const address = await ask("Street address");

  const timezone = await ask("Time zone", "America/New_York");
  if (!isValidTimeZone(timezone)) throw new Error(`Unknown time zone "${timezone}"`);

  const hours: BusinessHours = { ...DEFAULT_HOURS };
  if ((await ask("Use Mon-Fri 9:00-17:00? (y/n)", "y")).toLowerCase() === "n") {
    for (const day of WEEKDAYS) {
      const value = await ask(`  ${day} (HH:MM-HH:MM or closed)`, DEFAULT_HOURS[day]);
      if (value !== "closed" && !parseHoursRange(value)) throw new Error(`Invalid hours "${value}"`);
      hours[day] = value;
    }
  }

  const duration = Number(await ask("Default appointment length in minutes", "30"));
  const greeting = await ask("Greeting", `Thanks for calling ${name}, how can I help you today?`);

  let vapiPhone: { id: string; number: string } | null = null;
  const vapiKey = process.env.VAPI_API_KEY;
  if (vapiKey && (await ask("Buy a Vapi phone number now? (y/n)", "y")).toLowerCase() === "y") {
    const serverUrl = await ask(
      "Public webhook URL",
      process.env.PUBLIC_SERVER_URL ? `${process.env.PUBLIC_SERVER_URL}/webhooks/vapi` : "",
    );
    const areaCode = await ask("Preferred area code", "617");
    try {
      vapiPhone = await createVapiClient(vapiKey).buyPhoneNumber({
        areaCode,
        serverUrl,
        secret: process.env.VAPI_WEBHOOK_SECRET,
        name: name.slice(0, 40),
      });
      console.log(`  Bought ${vapiPhone.number}`);
    } catch (err) {
      console.warn(`  Could not buy a number (${(err as Error).message}). Add one later in Vapi.`);
    }
  }

  const { data: business, error } = await db
    .from("businesses")
    .insert({
      name,
      owner_name: ownerName || null,
      owner_phone: ownerPhone,
      owner_email: ownerEmail || null,
      address: address || null,
      vapi_phone_number: vapiPhone?.number ?? null,
      vapi_phone_id: vapiPhone?.id ?? null,
      timezone,
      business_hours: hours,
      greeting_message: greeting,
      appointment_duration_min: Number.isFinite(duration) && duration >= 10 ? duration : 30,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create business: ${error.message}`);

  if ((await ask("Seed starter FAQs? (y/n)", "y")).toLowerCase() === "y") {
    const faqs = [
      { question: "What are your hours?", answer: "Please see our opening hours.", category: "hours" },
      ...(address
        ? [{ question: "Where are you located?", answer: `We're at ${address}.`, category: "location" }]
        : []),
    ].map((f, i) => ({ ...f, business_id: business.id, sort_order: i }));
    const { error: faqError } = await db.from("faq_items").insert(faqs);
    if (faqError) console.warn(`  FAQ seed failed: ${faqError.message}`);
  }

  rl.close();
  console.log(`
Done.
  Business id : ${business.id}
  Phone       : ${vapiPhone?.number ?? "(not provisioned)"}
  Dashboard   : sign up with ${ownerEmail || "the owner email"} to claim this business
`);
}

main().catch((err) => {
  console.error(`Setup failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
