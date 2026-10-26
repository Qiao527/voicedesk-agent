import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption, SceneBackground } from "../components/primitives";
import { color } from "../theme";

const StatCard: React.FC<{ label: string; value: string; accent: string; delay: number }> = ({
  label,
  value,
  accent,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.7 }, durationInFrames: 22 });
  return (
    <div
      style={{
        flex: 1,
        background: color.card,
        borderRadius: 20,
        padding: "22px 24px",
        boxShadow: "0 16px 40px rgba(2,6,23,0.28)",
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 600, color: color.slate, letterSpacing: 0.3 }}>{label}</span>
      <span style={{ fontSize: 44, fontWeight: 700, color: accent, letterSpacing: -1 }}>{value}</span>
    </div>
  );
};

const Chart: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = [0.5, 0.72, 0.6, 0.85, 0.95, 0.78, 1];
  return (
    <div
      style={{
        background: color.card,
        borderRadius: 20,
        padding: "24px 26px",
        boxShadow: "0 16px 40px rgba(2,6,23,0.28)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        flex: 1,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 600, color: color.ink }}>Calls this week</span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 150 }}>
        {bars.map((b, i) => {
          const g = spring({ frame: frame - delay - i * 4, fps, config: { damping: 200 }, durationInFrames: 22 });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${b * 100 * g}%`,
                borderRadius: 10,
                background: `linear-gradient(180deg, ${color.brandLight}, ${color.brand})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const FollowUpRow: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 20 });
  return (
    <div
      style={{
        background: color.card,
        borderRadius: 20,
        padding: "20px 24px",
        boxShadow: "0 16px 40px rgba(2,6,23,0.28)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: s,
        transform: `translateX(${interpolate(s, [0, 1], [20, 0])}px)`,
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 999, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: color.ink }}>Follow-up: cracked molar, in pain</span>
        <span style={{ fontSize: 17, color: color.slate }}>Flagged urgent · owner texted immediately</span>
      </div>
      <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, color: color.amber, background: "#fffbeb", padding: "6px 12px", borderRadius: 999 }}>URGENT</span>
    </div>
  );
};

export const DashboardScene: React.FC = () => (
  <SceneBackground>
    <AbsoluteFill style={{ padding: "76px 80px 140px", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", gap: 22 }}>
        <StatCard label="Calls answered" value="64" accent={color.brand} delay={6} />
        <StatCard label="Appointments booked" value="28" accent={color.emerald} delay={14} />
        <StatCard label="Resolved without a human" value="86%" accent={color.sky} delay={22} />
      </div>
      <div style={{ display: "flex", gap: 22, flex: 1 }}>
        <Chart delay={30} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <FollowUpRow delay={54} />
        </div>
      </div>
    </AbsoluteFill>
    <Caption delay={16}>Every call summarized, scored, and on the dashboard.</Caption>
  </SceneBackground>
);
