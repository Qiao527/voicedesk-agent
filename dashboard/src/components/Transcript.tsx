import { clsx } from "clsx";
import { Bot } from "lucide-react";
import { parseTranscript } from "../lib/transcript";
import { Avatar } from "./ui";

export function Transcript({ text, callerName }: { text: string | null; callerName: string | null }) {
  const turns = parseTranscript(text);
  if (turns.length === 0) {
    return <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No transcript for this call.</p>;
  }

  return (
    <ol className="space-y-3">
      {turns.map((turn, i) => {
        const ai = turn.speaker === "ai";
        return (
          <li key={i} className={clsx("flex items-end gap-2", !ai && "flex-row-reverse")}>
            {ai ? (
              <span className="bg-brand-600 grid size-7 shrink-0 place-items-center rounded-full text-white">
                <Bot className="size-3.5" />
              </span>
            ) : (
              <Avatar name={callerName} className="size-7 text-[10px]" />
            )}
            <p
              className={clsx(
                "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                ai ? "rounded-bl-sm bg-slate-100 text-slate-800" : "bg-brand-600 rounded-br-sm text-white",
              )}
            >
              {turn.text}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
