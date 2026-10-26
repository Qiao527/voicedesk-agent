import type { Business, FaqItem } from "../domain/types";

/**
 * Fictional demo business used by the seed script, the offline call
 * simulator and the test suite. All contact details are reserved/fake
 * (555-01xx numbers, example.com).
 */
export const DEMO_BUSINESS_ID = "6f1c2a4e-8b3d-4e7a-9c1f-2d5b8a7e4c10";
export const DEMO_PHONE_NUMBER = "+16175550100";

export function demoBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: DEMO_BUSINESS_ID,
    name: "Harborview Dental",
    phone: "+16175550101",
    owner_user_id: null,
    owner_name: "Dr. Maya Chen",
    owner_email: "owner@harborview-dental.example.com",
    owner_phone: "+16175550142",
    address: "200 Atlantic Ave, Boston, MA 02110",
    vapi_phone_number: DEMO_PHONE_NUMBER,
    vapi_phone_id: "demo-phone-id",
    calendar_id: "primary",
    google_calendar_connected_at: null,
    timezone: "America/New_York",
    business_hours: {
      mon: "8:00-17:00",
      tue: "8:00-17:00",
      wed: "8:00-17:00",
      thu: "8:00-19:00",
      fri: "8:00-15:00",
      sat: "closed",
      sun: "closed",
    },
    greeting_message: "Thanks for calling Harborview Dental, this is the front desk. How can I help?",
    recording_disclosure: "This call may be recorded for quality and scheduling.",
    system_prompt_override: null,
    appointment_duration_min: 45,
    status: "active",
    created_at: "2026-01-05T15:00:00.000Z",
    ...overrides,
  };
}

const faq = (sort_order: number, category: string, question: string, answer: string): FaqItem => ({
  id: `00000000-0000-4000-8000-${String(sort_order + 1).padStart(12, "0")}`,
  business_id: DEMO_BUSINESS_ID,
  question,
  answer,
  category,
  sort_order,
  created_at: "2026-01-05T15:00:00.000Z",
});

export const DEMO_FAQS: FaqItem[] = [
  faq(
    0,
    "insurance",
    "Do you take insurance?",
    "Yes. We're in network with Delta Dental, MetLife, Cigna and Aetna PPO plans. We'll verify your coverage before your visit.",
  ),
  faq(
    1,
    "services",
    "What services do you offer?",
    "Cleanings and exams, fillings, crowns, whitening, Invisalign, and emergency visits.",
  ),
  faq(
    2,
    "pricing",
    "How much is a cleaning without insurance?",
    "A cleaning and exam is $189 for new patients without insurance, including X-rays.",
  ),
  faq(
    3,
    "location",
    "Is there parking?",
    "Yes, validated parking is available in the Rowes Wharf garage. We're a five-minute walk from Aquarium station.",
  ),
  faq(
    4,
    "policies",
    "What is your cancellation policy?",
    "Please give us 24 hours' notice. Late cancellations may have a $50 fee.",
  ),
];
