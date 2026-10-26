import type { CallOutcome, Sentiment, Urgency } from "./types";

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return "Unknown number";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : value;
}

export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

export function formatLongDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "5 min ago", "yesterday", "3 days ago". Falls back to a date after a week. */
export function formatRelative(iso: string, now = new Date(), timeZone?: string): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(diff / 86_400), "day");
  return new Date(iso).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const OUTCOME_META: Record<CallOutcome, { label: string; tone: Tone; color: string }> = {
  appointment_booked: { label: "Booked", tone: "green", color: "#10b981" },
  faq_answered: { label: "Answered", tone: "indigo", color: "#6366f1" },
  message_taken: { label: "Message", tone: "sky", color: "#0ea5e9" },
  transferred: { label: "Transferred", tone: "amber", color: "#f59e0b" },
  missed: { label: "Missed", tone: "rose", color: "#f43f5e" },
  other: { label: "Other", tone: "slate", color: "#94a3b8" },
};

export const SENTIMENT_META: Record<Sentiment, { label: string; tone: Tone }> = {
  positive: { label: "Positive", tone: "green" },
  neutral: { label: "Neutral", tone: "slate" },
  negative: { label: "Negative", tone: "rose" },
};

export const URGENCY_META: Record<Urgency, { label: string; tone: Tone }> = {
  high: { label: "Urgent", tone: "rose" },
  medium: { label: "Normal", tone: "amber" },
  low: { label: "Low", tone: "slate" },
};

export type Tone = "green" | "indigo" | "sky" | "amber" | "rose" | "slate";
