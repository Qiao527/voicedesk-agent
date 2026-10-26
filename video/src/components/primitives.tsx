import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font } from "../theme";

/** Dark cinematic backdrop with a soft brand glow, shared by every scene. */
export const SceneBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      fontFamily: font,
      background: `linear-gradient(135deg, ${color.bgFrom} 0%, ${color.bgTo} 100%)`,
    }}
  >
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 55% at 50% 12%, rgba(129,140,248,0.28), rgba(129,140,248,0) 70%)`,
      }}
    />
    {children}
  </AbsoluteFill>
);

/** The product's audio-waveform mark on a rounded indigo tile. */
export const Logo: React.FC<{ size?: number; animated?: boolean }> = ({ size = 72, animated }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const xs = [9, 13.5, 18, 22.5];
  const lengths = [6, 12, 7, 3];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: `linear-gradient(135deg, ${color.brandLight}, ${color.brand})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 18px 50px rgba(79,70,229,0.5)",
      }}
    >
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 32 32">
        <g stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
          {xs.map((x, i) => {
            const base = lengths[i];
            const len = animated
              ? interpolate(Math.sin((frame / fps) * 6 + i), [-1, 1], [base * 0.55, base * 1.35])
              : base;
            return <path key={x} d={`M${x} ${16 - len / 2}v${len}`} />;
          })}
        </g>
      </svg>
    </div>
  );
};

/** Caption pinned to the lower third, fading up as the scene settles. */
export const Caption: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 18 });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 56,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px)`,
      }}
    >
      <span
        style={{
          fontSize: 30,
          fontWeight: 500,
          color: "rgba(226,232,240,0.95)",
          letterSpacing: -0.3,
        }}
      >
        {children}
      </span>
    </div>
  );
};

/** A chat bubble that springs in; `who` controls side and color. */
export const Bubble: React.FC<{
  who: "caller" | "ai";
  delay: number;
  children: React.ReactNode;
}> = ({ who, delay, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, mass: 0.7 }, durationInFrames: 20 });
  const ai = who === "ai";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: ai ? "flex-start" : "flex-end",
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px) scale(${interpolate(s, [0, 1], [0.94, 1])})`,
      }}
    >
      <div
        style={{
          maxWidth: "76%",
          padding: "16px 20px",
          borderRadius: 20,
          borderBottomLeftRadius: ai ? 6 : 20,
          borderBottomRightRadius: ai ? 20 : 6,
          fontSize: 23,
          lineHeight: 1.35,
          fontWeight: 450,
          color: ai ? color.white : color.ink,
          background: ai ? `linear-gradient(135deg, ${color.brandBright}, ${color.brand})` : color.white,
          boxShadow: ai ? "0 12px 30px rgba(79,70,229,0.35)" : "0 10px 26px rgba(2,6,23,0.18)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** A small pill showing a tool the model invoked. */
export const ToolChip: React.FC<{ delay: number; label: string; done?: boolean }> = ({ delay, label, done }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 20 }, durationInFrames: 16 });
  return (
    <div style={{ display: "flex", justifyContent: "center", opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.8, 1])})` }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 16px",
          borderRadius: 999,
          fontSize: 18,
          fontWeight: 600,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: done ? color.emerald : color.brandLight,
          background: done ? "rgba(16,185,129,0.12)" : "rgba(129,140,248,0.14)",
          border: `1px solid ${done ? "rgba(16,185,129,0.4)" : "rgba(129,140,248,0.4)"}`,
        }}
      >
        {done ? (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "currentColor", display: "inline-block" }} />
        )}
        {label}
      </div>
    </div>
  );
};
