import { Router, type Request, type Response } from "express";
import { serializeError } from "../lib/logger";
import { buildAssistant, buildFallbackAssistant } from "./assistant";
import { resolveBusiness, type PipelineDeps } from "./context";
import { handleEndOfCallReport } from "./end-of-call";
import {
  AssistantRequestSchema,
  EndOfCallReportSchema,
  extractMessage,
  FunctionCallSchema,
  ToolCallsSchema,
} from "./schemas";
import { runTool } from "./tools";

/**
 * Single endpoint for every Vapi server message.
 *
 * Failure policy per message type:
 * - assistant-request: never fail. A DB outage still answers the phone with
 *   the fallback assistant, because a ringing line that drops is the worst case.
 * - tool-calls: always HTTP 200. Vapi ignores non-2xx bodies, so failures are
 *   reported per call in the `error` field instead.
 * - end-of-call-report: 500 if persistence fails, so Vapi retries. Safe
 *   because the handler is idempotent.
 */
export function createVapiRouter(deps: PipelineDeps): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const message = extractMessage(req.body);
    if (!message) {
      res.status(400).json({ error: "Invalid Vapi webhook payload" });
      return;
    }
    const log = deps.logger.child({ event: message.type });

    switch (message.type) {
      case "assistant-request": {
        const parsed = AssistantRequestSchema.safeParse(message);
        if (!parsed.success) {
          log.warn("vapi.invalid_message");
          res.json({ assistant: buildFallbackAssistant(deps.voice) });
          return;
        }
        try {
          const business = await resolveBusiness(deps, parsed.data);
          if (!business) {
            res.json({ assistant: buildFallbackAssistant(deps.voice) });
            return;
          }
          const faqs = await deps.repo.listFaqs(business.id);
          log.info("vapi.assistant_served", { businessId: business.id, faqs: faqs.length });
          res.json({ assistant: buildAssistant(business, faqs, deps.voice, deps.now()) });
        } catch (err) {
          log.error("vapi.assistant_request_failed", serializeError(err));
          res.json({ assistant: buildFallbackAssistant(deps.voice) });
        }
        return;
      }

      case "tool-calls": {
        const parsed = ToolCallsSchema.safeParse(message);
        if (!parsed.success) {
          log.warn("vapi.invalid_message");
          res.json({ results: [] });
          return;
        }
        const msg = parsed.data;
        const business = await resolveBusiness(deps, msg).catch((err) => {
          log.error("vapi.business_lookup_failed", serializeError(err));
          return null;
        });
        const callerNumber = msg.customer?.number ?? msg.call.customer?.number ?? null;
        const results = await Promise.all(
          msg.toolCallList.map(async (toolCall) => {
            const name = toolCall.function?.name ?? toolCall.name ?? "";
            const args = toolCall.function?.arguments ?? toolCall.parameters ?? {};
            const outcome = await runTool(name, args, { deps, business, call: msg.call, callerNumber });
            return { name, toolCallId: toolCall.id, ...outcome };
          }),
        );
        res.json({ results });
        return;
      }

      case "function-call": {
        const parsed = FunctionCallSchema.safeParse(message);
        if (!parsed.success) {
          res.json({ result: "Invalid function call." });
          return;
        }
        const msg = parsed.data;
        const business = await resolveBusiness(deps, msg).catch(() => null);
        const outcome = await runTool(msg.functionCall.name, msg.functionCall.parameters, {
          deps,
          business,
          call: msg.call,
          callerNumber: msg.customer?.number ?? msg.call.customer?.number ?? null,
        });
        res.json({ result: "result" in outcome ? outcome.result : outcome.error });
        return;
      }

      case "end-of-call-report": {
        const parsed = EndOfCallReportSchema.safeParse(message);
        if (!parsed.success) {
          log.warn("vapi.invalid_message");
          res.status(400).json({ error: "Invalid end-of-call-report" });
          return;
        }
        try {
          const call = await handleEndOfCallReport(deps, parsed.data);
          res.json({ ok: true, callId: call.id });
        } catch (err) {
          log.error("vapi.end_of_call_failed", serializeError(err));
          res.status(500).json({ error: "Failed to record call" });
        }
        return;
      }

      default:
        // status-update, transcript, speech-update, hang, etc.
        res.json({ ok: true });
    }
  });

  return router;
}
