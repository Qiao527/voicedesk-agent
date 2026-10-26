import "dotenv/config";
import "../config/env";
import { supabase } from "../services/supabase";

const BUSINESS = {
  name: "Boston Dental Demo",
  owner_name: "Zaiqiao",
  owner_phone: "+16175550142",
  owner_email: "owner@example.com",
  address: "123 Main St, Boston, MA 02101",
  vapi_phone_number: "+16175550100",
  calendar_id: "primary",
  timezone: "America/New_York",
  business_hours: {
    mon: "9:00-17:00",
    tue: "9:00-17:00",
    wed: "9:00-17:00",
    thu: "9:00-17:00",
    fri: "9:00-17:00",
    sat: "closed",
    sun: "closed",
  },
  greeting_message:
    "Hello! Thanks for calling Boston Dental Demo. How can I help you today?",
  recording_disclosure:
    "This call may be recorded for quality and scheduling.",
  voice_provider: "11labs",
  voice_id: "paula",
  plan: "starter",
  monthly_fee: 25000,
  status: "active",
};

const FAQS = [
  {
    question: "What are your business hours?",
    answer:
      "We're open Monday through Friday, 9am to 5pm. We're closed on weekends.",
    category: "hours",
    sort_order: 0,
  },
  {
    question: "Where are you located?",
    answer: "We're located at 123 Main St, Boston, MA 02101.",
    category: "location",
    sort_order: 1,
  },
  {
    question: "Do you accept walk-ins?",
    answer:
      "We prefer appointments, but we do accept walk-ins when availability allows.",
    category: "services",
    sort_order: 2,
  },
  {
    question: "What services do you offer?",
    answer:
      "We offer general dentistry, cleanings, fillings, crowns, and cosmetic dentistry.",
    category: "services",
    sort_order: 3,
  },
  {
    question: "Do you accept insurance?",
    answer:
      "Yes, we accept most major dental insurance plans. Please call to verify your specific plan.",
    category: "insurance",
    sort_order: 4,
  },
];

async function main() {
  console.log("Creating Boston Dental Demo business...\n");

  const { data: business, error } = await supabase
    .from("businesses")
    .insert(BUSINESS)
    .select()
    .single();

  if (error) {
    console.error("Failed:", error.message);
    process.exit(1);
  }

  console.log(`  Business ID: ${business.id}`);
  console.log(`  Phone:       ${BUSINESS.vapi_phone_number}`);

  const faqs = FAQS.map((f) => ({ ...f, business_id: business.id }));
  const { error: faqErr } = await supabase.from("faq_items").insert(faqs);
  if (faqErr) {
    console.error("FAQ seed warning:", faqErr.message);
  } else {
    console.log(`  FAQs:        ${faqs.length} items seeded`);
  }

  console.log("\nDone! Call +16175550100 to test.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
