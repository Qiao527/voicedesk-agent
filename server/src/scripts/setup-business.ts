/**
 * CLI script to onboard a new business.
 *
 * Usage:
 *   npx ts-node src/scripts/setup-business.ts
 *
 * What it does:
 *   1. Prompts for business details (name, owner, hours, etc.)
 *   2. Buys a Vapi phone number pointed at our webhook
 *   3. Creates the business record in Supabase
 *   4. Optionally seeds some FAQ items
 *   5. Prints a summary with the phone number to give to the client
 */

import "dotenv/config";
import "../config/env";
import * as readline from "readline";
import { supabase } from "../services/supabase";
import { buyPhoneNumber } from "../services/vapi";
import { normalizeE164 } from "../services/phone";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

const DEFAULT_HOURS = {
  mon: "9:00-17:00",
  tue: "9:00-17:00",
  wed: "9:00-17:00",
  thu: "9:00-17:00",
  fri: "9:00-17:00",
  sat: "closed",
  sun: "closed",
};

const SAMPLE_FAQS = [
  {
    question: "What are your business hours?",
    answer: "We're open Monday through Friday, 9am to 5pm. We're closed on weekends.",
    category: "hours",
  },
  {
    question: "Where are you located?",
    answer: "",
    category: "location",
  },
  {
    question: "Do you accept walk-ins?",
    answer: "We prefer appointments, but we do accept walk-ins when availability allows.",
    category: "services",
  },
];

async function main() {
  console.log("\n─── VoiceDesk AI — New Business Setup ───\n");

  // 1. Collect business info
  const name = await ask("Business name");
  if (!name) {
    console.error("Business name is required.");
    process.exit(1);
  }

  const ownerName = await ask("Owner name");
  const ownerPhoneRaw = await ask(
    "Owner phone (for SMS notifications AND live call transfer, e.g. +16175551234)",
  );
  const ownerPhone = ownerPhoneRaw ? normalizeE164(ownerPhoneRaw) : null;
  if (ownerPhoneRaw && !ownerPhone) {
    console.error(
      `"${ownerPhoneRaw}" could not be normalized to E.164. Use +<country><number>, e.g. +16175551234.`,
    );
    process.exit(1);
  }
  const ownerEmail = await ask("Owner email");
  const address = await ask("Business address");
  const timezone = await ask("Timezone", "America/New_York");

  const customHours = await ask("Use default hours Mon-Fri 9-5? (y/n)", "y");
  const businessHours =
    customHours.toLowerCase() === "n"
      ? JSON.parse(await ask("Enter hours as JSON"))
      : DEFAULT_HOURS;

  const greeting = await ask(
    "Custom greeting",
    `Hello! Thanks for calling ${name}. How can I help you today?`,
  );

  const plan = await ask("Plan (starter/pro)", "starter");
  const areaCode = await ask("Preferred area code for phone number", "617");

  // 2. Determine webhook URL
  const webhookUrl = await ask(
    "Webhook URL (your public server URL + /webhooks/vapi)",
    "https://your-server.com/webhooks/vapi",
  );

  console.log("\n─── Setting up... ───\n");

  // 3. Buy a Vapi phone number
  console.log("Buying Vapi phone number...");
  let vapiPhone;
  try {
    vapiPhone = await buyPhoneNumber({
      areaCode,
      serverUrl: webhookUrl,
    });
    console.log(`  Phone number: ${vapiPhone.number}`);
    console.log(`  Vapi phone ID: ${vapiPhone.id}`);
  } catch (err) {
    console.error("Failed to buy phone number:", err);
    console.log("Continuing without phone number — you can add one manually later.\n");
  }

  // 4. Create business in Supabase
  console.log("Creating business record in Supabase...");
  const { data: business, error } = await supabase
    .from("businesses")
    .insert({
      name,
      owner_name: ownerName || null,
      owner_phone: ownerPhone,
      owner_email: ownerEmail || null,
      address: address || null,
      vapi_phone_number: vapiPhone?.number || null,
      vapi_phone_id: vapiPhone?.id || null,
      calendar_id: "primary",
      timezone,
      business_hours: businessHours,
      greeting_message: greeting,
      voice_provider: "11labs",
      voice_id: "paula",
      plan,
      monthly_fee: plan === "pro" ? 40000 : 25000,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create business:", error.message);
    process.exit(1);
  }

  console.log(`  Business ID: ${business.id}`);

  // 5. Seed FAQ items
  const seedFaqs = await ask("Seed sample FAQ items? (y/n)", "y");
  if (seedFaqs.toLowerCase() === "y") {
    const faqs = SAMPLE_FAQS.map((faq, i) => ({
      business_id: business.id,
      question: faq.question,
      answer:
        faq.category === "location" && address
          ? `We're located at ${address}.`
          : faq.answer,
      category: faq.category,
      sort_order: i,
    }));

    const { error: faqError } = await supabase.from("faq_items").insert(faqs);
    if (faqError) {
      console.error("Warning: failed to seed FAQs:", faqError.message);
    } else {
      console.log(`  Seeded ${faqs.length} FAQ items`);
    }
  }

  // 6. Print summary
  console.log("\n─── Setup Complete ───\n");
  console.log(`  Business:    ${name}`);
  console.log(`  Business ID: ${business.id}`);
  if (vapiPhone) {
    console.log(`  Phone:       ${vapiPhone.number}`);
    console.log(`  Vapi ID:     ${vapiPhone.id}`);
  }
  console.log(`  Webhook:     ${webhookUrl}`);
  console.log(`  Plan:        ${plan} ($${plan === "pro" ? 400 : 250}/mo)`);
  console.log(`  Timezone:    ${timezone}`);
  console.log();
  if (vapiPhone) {
    console.log(`  Call ${vapiPhone.number} to test the AI receptionist.`);
  }
  console.log();

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
