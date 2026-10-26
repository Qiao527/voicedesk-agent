# VoiceDesk demo video

The source for the product demo shown at the top of the main [README](../README.md).
It is a code-driven [Remotion](https://remotion.dev) project — every scene is a
React component, so the walkthrough stays in sync with the product and re-renders
deterministically.

## Compositions

| id | Output | Notes |
| --- | --- | --- |
| `VoiceDeskDemo` | `../docs/media/voicedesk-demo.mp4` | Full ~30s cut: intro, live booking call, returning caller, dashboard, outro |
| `VoiceDeskHighlight` | `../docs/media/voicedesk-demo.gif` | Shorter cut rendered to a GIF for inline display in the README |

## Develop

```bash
npm install
npm run preview          # Remotion Studio at http://localhost:3000
```

## Render

```bash
npm run render           # MP4 (1280x720, 30fps)
npm run render:gif       # GIF (640x360, ~15fps)
```

Rendering drives headless Chrome. On a fresh machine Remotion downloads a
Chrome Headless Shell automatically; pass `--browser-executable=<path>` to use
an existing Chrome instead.

## Structure

```
src/
├── index.ts        registerRoot
├── Root.tsx        composition definitions + scene running order
├── Film.tsx        sequences scenes with a fade-in between cuts
├── theme.ts        palette (from the product) and the Inter font
├── components/     logo, caption, chat bubble, tool chip
└── scenes/         title, call, returning caller, dashboard, outro
```

Remotion is free for individuals and small teams; larger organizations need a
company license. See the [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
