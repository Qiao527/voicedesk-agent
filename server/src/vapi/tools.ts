import { serializeError } from "../lib/logger";
import { TOOL_NAMES } from "./assistant";
import type { ToolContext } from "./context";
import { bookAppointment } from "./handlers/book-appointment";
import { checkAvailability } from "./handlers/check-availability";
import { takeMessage } from "./handlers/take-message";
import { parseToolArguments } from "./schemas";

/**
 * Vapi expects exactly one of `result` or `error`, as a single-line string.
 * `result` covers expected outcomes the model should talk through ("we're
 * closed that day"); `error` is reserved for real failures.
 */
export type ToolResult = { result: string } | { error: string };

type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

const HANDLERS: Record<string, ToolHandler> = {
  [TOOL_NAMES.checkAvailability]: checkAvailability,
  [TOOL_NAMES.bookAppointment]: bookAppointment,
  [TOOL_NAMES.takeMessage]: takeMessage,
};

const FAILURE =
  "Something went wrong on our side. Apologize briefly and offer to take a message so the team can follow up.";

function singleLine(result: ToolResult): ToolResult {
  return "result" in result
    ? { result: result.result.replace(/\s*\n+\s*/g, " ").trim() }
    : { error: result.error.replace(/\s*\n+\s*/g, " ").trim() };
}

/** Run one tool call. Never throws: a thrown error becomes `{ error }`. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const log = ctx.deps.logger.child({ tool: name, callId: ctx.call.id });
  const handler = HANDLERS[name];
  if (!handler) {
    log.warn("tool.unknown");
    return { error: `Unknown tool "${name}".` };
  }

  const args = parseToolArguments(rawArgs);
  if (!args) {
    log.warn("tool.bad_arguments");
    return { result: "The tool arguments were not valid JSON. Try the call again with the required fields." };
  }

  const started = Date.now();
  try {
    const result = singleLine(await handler(args, ctx));
    log.info("tool.completed", { ms: Date.now() - started, ok: "result" in result });
    return result;
  } catch (err) {
    log.error("tool.failed", { ms: Date.now() - started, ...serializeError(err) });
    return { error: FAILURE };
  }
}
