import React from "react";
import { Composition } from "remotion";
import { Film, type Scene } from "./Film";
import { CallScene } from "./scenes/CallScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { OutroScene } from "./scenes/OutroScene";
import { ReturningCallerScene } from "./scenes/ReturningCallerScene";
import { TitleScene } from "./scenes/TitleScene";
import { fps } from "./theme";

const fullScenes: Scene[] = [
  { key: "title", node: <TitleScene />, duration: 84 },
  { key: "call", node: <CallScene />, duration: 345 },
  { key: "returning", node: <ReturningCallerScene />, duration: 168 },
  { key: "dashboard", node: <DashboardScene />, duration: 186 },
  { key: "outro", node: <OutroScene />, duration: 108 },
];

// A tighter cut for the README GIF: hero call plus the bookends.
const highlightScenes: Scene[] = [
  { key: "title", node: <TitleScene />, duration: 54 },
  { key: "call", node: <CallScene />, duration: 318 },
  { key: "outro", node: <OutroScene />, duration: 84 },
];

const sum = (s: Scene[]) => s.reduce((n, x) => n + x.duration, 0);

// Scene lists hold React elements, which are not serializable as Composition
// defaultProps, so each film is its own prop-less component.
const DemoFilm: React.FC = () => <Film scenes={fullScenes} />;
const HighlightFilm: React.FC = () => <Film scenes={highlightScenes} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="VoiceDeskDemo"
      component={DemoFilm}
      durationInFrames={sum(fullScenes)}
      fps={fps}
      width={1280}
      height={720}
    />
    <Composition
      id="VoiceDeskHighlight"
      component={HighlightFilm}
      durationInFrames={sum(highlightScenes)}
      fps={fps}
      width={1280}
      height={720}
    />
  </>
);
