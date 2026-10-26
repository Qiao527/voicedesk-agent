import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

export const font = fontFamily;

/** Palette taken from the product: indigo brand gradient, slate ink, emerald success. */
export const color = {
  brand: "#4f46e5",
  brandLight: "#818cf8",
  brandBright: "#6366f1",
  bgFrom: "#0b1020",
  bgTo: "#1e1b4b",
  ink: "#0f172a",
  slate: "#64748b",
  slateLight: "#94a3b8",
  line: "#e2e8f0",
  card: "#ffffff",
  emerald: "#10b981",
  emeraldSoft: "#ecfdf5",
  amber: "#f59e0b",
  sky: "#0ea5e9",
  white: "#ffffff",
} as const;

export const fps = 30;
