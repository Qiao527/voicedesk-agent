import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bubble, Caption, SceneBackground, ToolChip } from "../components/primitives";
import { color } from "../theme";

const Equalizer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, height: 48 }}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const h = interpolate(Math.sin((frame / fps) * 7 + i * 0.9), [-1, 1], [10, 44]);
        return <div key={i} style={{ width: 7, height: h, borderRadius: 4, background: color.brandLight }} />;
      })}
    </div>
  );
};

const CallPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18 }, durationInFrames: 22 });
  const seconds = Math.floor(frame / fps) + 6;
  const mmss = `0:${String(seconds).padStart(2, "0")}`;
  return (
    <div
      style={{
        width: 330,
        borderRadius: 28,
        padding: 30,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 24px 60px rgba(2,6,23,0.4)",
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [-30, 0])}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 11, height: 11, borderRadius: 999, background: color.emerald, boxShadow: `0 0 0 5px rgba(16,185,129,0.25)` }} />
        <span style={{ fontSize: 19, fontWeight: 600, color: "rgba(226,232,240,0.9)" }}>On call</span>
        <span style={{ marginLeft: "auto", fontSize: 19, fontWeight: 500, color: color.slateLight, fontFamily: "ui-monospace, Menlo, monospace" }}>{mmss}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 1, color: color.slateLight, textTransform: "uppercase" }}>Incoming</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: color.white }}>Jordan Lee</span>
        <span style={{ fontSize: 20, color: color.slateLight, fontFamily: "ui-monospace, Menlo, monospace" }}>(617) 555-0199</span>
      </div>
      <Equalizer />
      <div
        style={{
          marginTop: 2,
          padding: "12px 16px",
          borderRadius: 14,
          background: "rgba(129,140,248,0.12)",
          border: "1px solid rgba(129,140,248,0.3)",
          fontSize: 17,
          color: "rgba(226,232,240,0.9)",
        }}
      >
        AI receptionist · Harborview Dental
      </div>
    </div>
  );
};

export const CallScene: React.FC = () => (
  <SceneBackground>
    <AbsoluteFill style={{ padding: "70px 80px 140px", flexDirection: "row", gap: 48, alignItems: "center" }}>
      <CallPanel />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
        <Bubble who="caller" delay={10}>Hi, I'd like to book a cleaning. It's Jordan Lee.</Bubble>
        <Bubble who="ai" delay={52}>Happy to help, Jordan. What day works for you?</Bubble>
        <Bubble who="caller" delay={96}>Monday, if you have it.</Bubble>
        <ToolChip delay={130} label="check_availability" />
        <Bubble who="ai" delay={160}>I have Monday at 8:00 AM. Shall I book it?</Bubble>
        <Bubble who="caller" delay={206}>Perfect.</Bubble>
        <ToolChip delay={238} label="book_appointment" done />
        <Bubble who="ai" delay={268}>You're booked for Monday at 8. See you then!</Bubble>
      </div>
    </AbsoluteFill>
    <Caption delay={40}>Answers every call — and books it into Google Calendar.</Caption>
  </SceneBackground>
);
