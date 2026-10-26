import React from "react";
import { AbsoluteFill, interpolate, Series, useCurrentFrame } from "remotion";

export interface Scene {
  key: string;
  node: React.ReactNode;
  duration: number;
}

/** Gentle fade-in at the top of each cut; content then animates in place. */
const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 7], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Film: React.FC<{ scenes: Scene[] }> = ({ scenes }) => (
  <AbsoluteFill style={{ backgroundColor: "#0b1020" }}>
    <Series>
      {scenes.map((s) => (
        <Series.Sequence key={s.key} durationInFrames={s.duration}>
          <FadeIn>{s.node}</FadeIn>
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
