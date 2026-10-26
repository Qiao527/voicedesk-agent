import type { Appointment, Business, Call, CallAnalysis, CallOutcome, FaqItem, Message, Sentiment, Urgency } from "./types";

/**
 * Sample data for demo mode: a fictional Boston dental practice. Generated
 * relative to "now" so the dashboard always looks current. Deterministic, so
 * screenshots and tests are stable.
 */

export const DEMO_BUSINESS: Business = {
  id: "6f1c2a4e-8b3d-4e7a-9c1f-2d5b8a7e4c10",
  name: "Harborview Dental",
  owner_name: "Dr. Maya Chen",
  owner_phone: "+16175550142",
  owner_email: "owner@harborview-dental.example.com",
  address: "200 Atlantic Ave, Boston, MA 02110",
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
  vapi_phone_number: "+16175550100",
  calendar_id: "primary",
  google_calendar_connected_at: "2026-09-02T14:12:00.000Z",
  appointment_duration_min: 45,
  status: "active",
};

export const DEMO_FAQS: FaqItem[] = [
  [
    "insurance",
    "Do you take insurance?",
    "Yes. We're in network with Delta Dental, MetLife, Cigna and Aetna PPO plans. We'll verify your coverage before your visit.",
  ],
  ["services", "What services do you offer?", "Cleanings and exams, fillings, crowns, whitening, Invisalign, and emergency visits."],
  [
    "pricing",
    "How much is a cleaning without insurance?",
    "A cleaning and exam is $189 for new patients without insurance, including X-rays.",
  ],
  [
    "location",
    "Is there parking?",
    "Yes, validated parking is available in the Rowes Wharf garage. We're a five-minute walk from Aquarium station.",
  ],
  ["policies", "What is your cancellation policy?", "Please give us 24 hours' notice. Late cancellations may have a $50 fee."],
].map(([category, question, answer], i) => ({
  id: `faq-${i + 1}`,
  question,
  answer,
  category,
  sort_order: i,
}));

// ─── Deterministic randomness ────────────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Jordan",
  "Priya",
  "Marcus",
  "Elena",
  "Sam",
  "Aisha",
  "Daniel",
  "Grace",
  "Luis",
  "Hannah",
  "Kenji",
  "Olivia",
  "Noah",
  "Fatima",
  "Ethan",
  "Sofia",
  "Ryan",
  "Mei",
  "Isaac",
  "Chloe",
];
const LAST = [
  "Lee",
  "Patel",
  "Johnson",
  "Rossi",
  "Ortiz",
  "Khan",
  "Murphy",
  "Kim",
  "Garcia",
  "Walsh",
  "Tanaka",
  "Brooks",
  "Nguyen",
  "Haddad",
  "Cole",
  "Moreno",
  "Fitzgerald",
  "Chen",
  "Levi",
  "Dubois",
];

interface Scenario {
  weight: number;
  outcome: CallOutcome;
  sentiment: Sentiment;
  duration: [number, number];
  intent: string;
  topics: string[];
  followUp?: string;
  urgency?: Urgency;
  reason?: string;
  transcript: (name: string, slot: string) => string[];
  summary: (name: string, slot: string) => string;
  message?: (name: string) => string;
}

const SCENARIOS: Scenario[] = [
  {
    weight: 30,
    outcome: "appointment_booked",
    sentiment: "positive",
    duration: [80, 190],
    intent: "book cleaning",
    topics: ["scheduling"],
    reason: "Cleaning",
    transcript: (n, slot) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, I'd like to book a cleaning. My name is ${n}.`,
      "AI: Happy to help. What day works best for you?",
      "Caller: Sometime next week, if possible.",
      `AI: I have ${slot}, or a few other times that week. Would ${slot} work?`,
      "Caller: That's perfect.",
      `AI: You're booked for a cleaning on ${slot}. Is the number you're calling from the best one to reach you?`,
      "Caller: Yes, it is. Thanks so much!",
      "AI: You're all set. We'll see you then!",
    ],
    summary: (n, slot) => `${n} booked a cleaning for ${slot}.`,
  },
  {
    weight: 14,
    outcome: "appointment_booked",
    sentiment: "positive",
    duration: [120, 240],
    intent: "new patient exam",
    topics: ["scheduling", "insurance"],
    reason: "New patient exam",
    transcript: (n, slot) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, I just moved to Boston and I'm looking for a new dentist. I'm ${n}.`,
      "AI: Welcome! We'd love to see you. Do you have dental insurance?",
      "Caller: I have MetLife through work. Do you take that?",
      "AI: Yes, we're in network with MetLife PPO plans, and we'll verify your coverage before your visit. Would you like to book a new patient exam?",
      "Caller: Yes please.",
      `AI: I have ${slot} available. Does that work?`,
      "Caller: Great, let's do it.",
      `AI: You're booked for a new patient exam on ${slot}. Please arrive ten minutes early to fill in paperwork.`,
    ],
    summary: (n, slot) => `${n}, a new patient with MetLife, booked an exam for ${slot}.`,
  },
  {
    weight: 18,
    outcome: "faq_answered",
    sentiment: "neutral",
    duration: [45, 110],
    intent: "insurance question",
    topics: ["insurance"],
    transcript: (n) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, this is ${n}. Do you accept Delta Dental?`,
      "AI: Yes, we're in network with Delta Dental, MetLife, Cigna and Aetna PPO plans. Would you like to book a visit?",
      "Caller: Not yet, I need to check my schedule. Thanks.",
      "AI: Of course. Call us any time. Have a great day!",
    ],
    summary: (n) => `${n} asked whether the practice accepts Delta Dental; confirmed in network.`,
  },
  {
    weight: 10,
    outcome: "faq_answered",
    sentiment: "neutral",
    duration: [40, 90],
    intent: "parking and location",
    topics: ["location"],
    transcript: (n) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, I have an appointment tomorrow. Is there parking near you? It's ${n}.`,
      "AI: Yes, validated parking is available in the Rowes Wharf garage, and we're a five-minute walk from Aquarium station.",
      "Caller: Perfect, thank you.",
    ],
    summary: (n) => `${n} asked about parking before an upcoming visit.`,
  },
  {
    weight: 7,
    outcome: "faq_answered",
    sentiment: "neutral",
    duration: [50, 100],
    intent: "pricing question",
    topics: ["pricing"],
    transcript: (n) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, I'm ${n}. I don't have insurance right now. How much is a cleaning?`,
      "AI: A cleaning and exam is $189 for new patients without insurance, and that includes X-rays.",
      "Caller: Okay, I'll think about it. Thanks.",
    ],
    summary: (n) => `${n} asked for self-pay cleaning pricing ($189 quoted from FAQ).`,
  },
  {
    weight: 6,
    outcome: "message_taken",
    sentiment: "negative",
    duration: [70, 150],
    intent: "dental emergency",
    topics: ["emergency"],
    urgency: "high",
    followUp: "Patient in pain; call back to fit in an emergency visit",
    transcript: (n) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, this is ${n}. I think I cracked a molar last night and it really hurts.`,
      "AI: I'm sorry, that sounds painful. I can't give medical advice, but I'll flag this as urgent for the team. What's the best number to reach you?",
      "Caller: This number is fine.",
      "AI: Thank you. I've marked your message urgent and someone will call you back as soon as possible.",
    ],
    summary: (n) => `${n} reported a cracked molar with significant pain and asked for an urgent visit.`,
    message: () => "Cracked a molar last night, in a lot of pain. Wants the earliest emergency appointment.",
  },
  {
    weight: 6,
    outcome: "message_taken",
    sentiment: "neutral",
    duration: [55, 120],
    intent: "billing question",
    topics: ["billing"],
    urgency: "medium",
    followUp: "Billing question needs a staff member",
    transcript: (n) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, it's ${n}. I got a bill for my last visit that I think insurance should have covered.`,
      "AI: I'm not able to look into billing myself, but I can take a message for our billing team. What would you like me to pass on?",
      "Caller: Just that the claim from my September visit seems to have been denied and I'd like someone to check.",
      "AI: Got it. Someone from billing will call you back.",
    ],
    summary: (n) => `${n} disputes a bill for a September visit and wants billing to review the claim.`,
    message: () => "Thinks the claim for their September visit was wrongly denied. Asked billing to review and call back.",
  },
  {
    weight: 5,
    outcome: "message_taken",
    sentiment: "neutral",
    duration: [45, 95],
    intent: "reschedule",
    topics: ["scheduling"],
    urgency: "low",
    transcript: (n) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, I'm ${n}. I need to move my appointment on Thursday.`,
      "AI: I can pass that on to the team so they can find you a new time. What days generally work for you?",
      "Caller: Any afternoon next week.",
      "AI: Thanks, I've left a message and someone will call you to reschedule.",
    ],
    summary: (n) => `${n} asked to move Thursday's appointment to an afternoon next week.`,
    message: () => "Needs to reschedule Thursday's appointment. Any afternoon next week works.",
  },
  {
    weight: 5,
    outcome: "transferred",
    sentiment: "neutral",
    duration: [30, 70],
    intent: "speak to the dentist",
    topics: ["transfer"],
    transcript: (n) => [
      "AI: This call may be recorded for quality and scheduling. Thanks for calling Harborview Dental, this is the front desk. How can I help?",
      `Caller: Hi, this is ${n}, I'm calling from Dr. Alvarez's office about a referral. Can I speak with Dr. Chen?`,
      "AI: Of course. Please hold while I connect you to someone at Harborview Dental.",
    ],
    summary: (n) => `${n} from a referring office asked for Dr. Chen and was transferred.`,
  },
  {
    weight: 6,
    outcome: "missed",
    sentiment: "neutral",
    duration: [0, 4],
    intent: "unknown",
    topics: [],
    followUp: "Missed call; call back",
    transcript: () => [],
    summary: () => "Caller hung up before speaking.",
  },
];

function pickScenario(r: number): Scenario {
  const total = SCENARIOS.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  for (const s of SCENARIOS) {
    acc += s.weight / total;
    if (r <= acc) return s;
  }
  return SCENARIOS[0];
}

const EDT_OFFSET_HOURS = 4;

function localInstant(base: Date, daysAgo: number, hour: number, minute: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour + EDT_OFFSET_HOURS, minute, 0, 0);
  return d;
}

function formatSlot(d: Date) {
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface DemoDataset {
  calls: Call[];
  messages: Message[];
  appointments: Appointment[];
}

export function generateDemoData(now = new Date(), count = 64): DemoDataset {
  const rand = mulberry32(527);
  const calls: Call[] = [];
  const messages: Message[] = [];
  const appointments: Appointment[] = [];

  // The newest few calls always include open follow-ups so the overview
  // shows that workflow; the rest follow the weighted scenario mix.
  const pinned = [SCENARIOS[5], SCENARIOS[9], SCENARIOS[6]];

  for (let i = 0; i < count; i++) {
    const scenario = pinned[i] ?? pickScenario(rand());
    const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
    let daysAgo = i < pinned.length ? i : Math.floor(rand() * 29);
    // Fewer calls on weekends, like a real practice.
    if ([0, 6].includes(localInstant(now, daysAgo, 12, 0).getUTCDay()) && rand() < 0.7) daysAgo += 2;
    const weekday = localInstant(now, daysAgo, 12, 0).getUTCDay();
    const afterHours = rand() < 0.12 || weekday === 0 || weekday === 6;
    const hour = afterHours ? (rand() < 0.5 ? 6 + Math.floor(rand() * 2) : 18 + Math.floor(rand() * 4)) : 8 + Math.floor(rand() * 9);
    let created = localInstant(now, daysAgo, hour, Math.floor(rand() * 60));
    if (created > now) created = new Date(now.getTime() - (i + 1) * 47 * 60_000);

    const apptDate = new Date(created.getTime() + (2 + Math.floor(rand() * 9)) * 86_400_000);
    apptDate.setUTCHours(9 + Math.floor(rand() * 7) + EDT_OFFSET_HOURS, rand() < 0.5 ? 0 : 30, 0, 0);
    while ([0, 6].includes(apptDate.getUTCDay())) apptDate.setUTCDate(apptDate.getUTCDate() + 1);
    const slot = formatSlot(apptDate);

    const id = `call-${String(i + 1).padStart(3, "0")}`;
    const vapiId = `vapi-${id}`;
    const number = `+1617555${String(1000 + Math.floor(rand() * 8999)).slice(-4)}`;
    const duration = Math.round(scenario.duration[0] + rand() * (scenario.duration[1] - scenario.duration[0]));
    const isMissed = scenario.outcome === "missed";
    const callerName = isMissed ? null : name;

    const analysis: CallAnalysis | null = isMissed
      ? null
      : {
          summary: scenario.summary(name, slot),
          sentiment: scenario.sentiment,
          caller_name: name,
          intent: scenario.intent,
          questions_answered: scenario.outcome === "faq_answered" || scenario.topics.includes("insurance"),
          follow_up_required: Boolean(scenario.followUp),
          follow_up_reason: scenario.followUp ?? null,
          topics: scenario.topics,
        };

    // Older follow-ups have been handled; recent ones are still open.
    const followUpOpen = Boolean(scenario.followUp) && daysAgo <= 3;

    calls.push({
      id,
      vapi_call_id: vapiId,
      caller_number: number,
      caller_name: callerName,
      status: isMissed ? "missed" : "completed",
      outcome: scenario.outcome,
      duration_seconds: duration,
      summary: scenario.summary(name, slot),
      transcript: scenario.transcript(name, slot).join("\n") || null,
      recording_url: null,
      sentiment: isMissed ? null : scenario.sentiment,
      follow_up_required: followUpOpen,
      analysis,
      cost_cents: isMissed ? 1 : Math.round(duration * 0.19),
      ended_reason: isMissed
        ? "customer-ended-call"
        : scenario.outcome === "transferred"
          ? "assistant-forwarded-call"
          : "customer-ended-call",
      created_at: created.toISOString(),
    });

    if (scenario.outcome === "appointment_booked") {
      const end = new Date(apptDate.getTime() + 45 * 60_000);
      appointments.push({
        id: `appt-${i + 1}`,
        call_id: id,
        caller_name: name,
        caller_phone: number,
        service_type: scenario.reason ?? "general",
        start_time: apptDate.toISOString(),
        end_time: end.toISOString(),
        duration_min: 45,
        reason: scenario.reason ?? null,
        google_event_id: `evt${i + 1}`,
        status: apptDate < now ? (rand() < 0.08 ? "no_show" : "completed") : "confirmed",
        created_at: created.toISOString(),
      });
    }

    if (scenario.message) {
      messages.push({
        id: `msg-${i + 1}`,
        call_id: id,
        caller_name: name,
        caller_phone: number,
        content: scenario.message(name),
        urgency: scenario.urgency ?? "medium",
        is_read: daysAgo > 3,
        created_at: new Date(created.getTime() + duration * 1000).toISOString(),
      });
    }
  }

  const newest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);
  return {
    calls: calls.sort(newest),
    messages: messages.sort(newest),
    appointments: appointments.sort((a, b) => b.start_time.localeCompare(a.start_time)),
  };
}
