import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bubble, Caption, SceneBackground } from "../components/primitives";
import { color } from "../theme";

const MemoryCard: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 }, durationInFrames: 22 });
  const rows = [
    ["Known caller", "Jordan Lee"],
    ["Calls before", "3"],
    ["Next visit", "Cleaning · Mon 8 AM"],
  ];
  return (
    <div
      style={{
        width: 384,
        borderRadius: 22,
        padding: "22px 24px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(129,140,248,0.4)",
        boxShadow: "0 20px 50px rgba(2,6,23,0.4)",
        opacity: s,
        transform: `translateX(${interpolate(s, [0, 1], [30, 0])}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 11, height: 11, borderRadius: 999, background: color.brandLight, boxShadow: "0 0 0 4px rgba(129,140,248,0.2)" }} />
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1, color: color.brandLight, textTransform: "uppercase" }}>
          Caller memory
        </span>
      </div>
      {rows.map(([k, v], i) => {
        const rs = spring({ frame: frame - delay - 8 - i * 6, fps, config: { damping: 200 }, durationInFrames: 16 });
        return (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, opacity: rs }}>
            <span style={{ fontSize: 19, color: color.slateLight, whiteSpace: "nowrap" }}>{k}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: color.white, whiteSpace: "nowrap" }}>{v}</span>
          </div>
        );
      })}
    </div>
  );
};

export const ReturningCallerScene: React.FC = () => (
  <SceneBackground>
    <AbsoluteFill style={{ padding: "0 90px 140px", flexDirection: "row", gap: 56, alignItems: "center" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        <Bubble who="ai" delay={16}>Welcome back to Harborview Dental! Am I speaking with Jordan?</Bubble>
        <Bubble who="caller" delay={62}>Yes — just checking on my appointment.</Bubble>
        <Bubble who="ai" delay={104}>You're all set for your cleaning Monday at 8:00 AM. Anything else?</Bubble>
      </div>
      <MemoryCard delay={30} />
    </AbsoluteFill>
    <Caption delay={20}>Remembers returning callers — by name.</Caption>
  </SceneBackground>
);
