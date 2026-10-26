import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Logo, SceneBackground } from "../components/primitives";
import { color } from "../theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, mass: 0.8 }, durationInFrames: 26 });
  const word = spring({ frame: frame - 10, fps, config: { damping: 200 }, durationInFrames: 22 });
  const tag = spring({ frame: frame - 24, fps, config: { damping: 200 }, durationInFrames: 22 });

  return (
    <SceneBackground>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28 }}>
        <div style={{ transform: `scale(${logo}) translateY(${interpolate(logo, [0, 1], [30, 0])}px)` }}>
          <Logo size={128} animated />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 2,
            opacity: word,
            transform: `translateY(${interpolate(word, [0, 1], [18, 0])}px)`,
          }}
        >
          <span style={{ fontSize: 84, fontWeight: 700, color: color.white, letterSpacing: -2 }}>Voice</span>
          <span style={{ fontSize: 84, fontWeight: 700, color: color.brandLight, letterSpacing: -2 }}>Desk</span>
        </div>
        <span
          style={{
            fontSize: 30,
            fontWeight: 400,
            color: "rgba(226,232,240,0.9)",
            opacity: tag,
            transform: `translateY(${interpolate(tag, [0, 1], [14, 0])}px)`,
          }}
        >
          The AI phone receptionist that never misses a call.
        </span>
      </AbsoluteFill>
    </SceneBackground>
  );
};
