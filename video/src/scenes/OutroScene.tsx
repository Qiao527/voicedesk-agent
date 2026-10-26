import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Logo, SceneBackground } from "../components/primitives";
import { color } from "../theme";

const Line: React.FC<{ label: string; value: string; delay: number }> = ({ label, value, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 20 });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [12, 0])}px)` }}>
      <span style={{ fontSize: 22, fontWeight: 600, color: color.brandLight, width: 130, textAlign: "right" }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 500, color: color.white, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{value}</span>
    </div>
  );
};

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 16 }, durationInFrames: 24 });

  return (
    <SceneBackground>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 34 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, transform: `scale(${logo})` }}>
          <Logo size={84} animated />
          <span style={{ fontSize: 60, fontWeight: 700, color: color.white, letterSpacing: -1.5 }}>
            Voice<span style={{ color: color.brandLight }}>Desk</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Line label="Live demo" value="qiao527.github.io/voicedesk-agent" delay={16} />
          <Line label="Source" value="github.com/Qiao527/voicedesk-agent" delay={28} />
        </div>
      </AbsoluteFill>
    </SceneBackground>
  );
};
