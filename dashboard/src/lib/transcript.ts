export interface Turn {
  speaker: "ai" | "caller";
  text: string;
}

const AI_LABELS = /^(ai|assistant|bot|agent|receptionist)$/i;
const CALLER_LABELS = /^(user|caller|customer|human)$/i;

/**
 * Split a Vapi transcript ("AI: ...\nUser: ...") into chat turns. Lines
 * without a recognized speaker label are appended to the previous turn, so
 * wrapped text stays together.
 */
export function parseTranscript(transcript: string | null | undefined): Turn[] {
  if (!transcript?.trim()) return [];
  const turns: Turn[] = [];
  for (const raw of transcript.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(line);
    const label = match?.[1] ?? "";
    const speaker = AI_LABELS.test(label) ? "ai" : CALLER_LABELS.test(label) ? "caller" : null;

    if (speaker && match) {
      const prev = turns.at(-1);
      if (prev && prev.speaker === speaker) prev.text = `${prev.text} ${match[2]}`.trim();
      else turns.push({ speaker, text: match[2] });
    } else if (turns.length) {
      turns[turns.length - 1].text += ` ${line}`;
    } else {
      turns.push({ speaker: "ai", text: line });
    }
  }
  return turns;
}
