import { z } from "zod";
import { formatPhoneForDisplay, normalizeE164 } from "../../domain/phone";
import type { ToolContext } from "../context";
import type { ToolResult } from "../tools";

const Args = z.object({
  caller_name: z.string().trim().min(1).max(120),
  caller_phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1).max(2000),
  urgency: z.enum(["low", "medium", "high"]).optional(),
});

export async function takeMessage(raw: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success) {
    return { result: "I need the caller's name and their message. Ask for whichever is missing." };
  }
  const args = parsed.data;
  const { business, deps, call } = ctx;
  const urgency = args.urgency ?? "medium";
  const callerPhone = normalizeE164(args.caller_phone) ?? ctx.callerNumber;

  // Retried tool call with identical content: don't store or alert twice.
  const prior = await deps.repo.listMessagesForVapiCall(call.id);
  const duplicate = prior.some((m) => m.content === args.message);

  if (!duplicate) {
    await deps.repo.insertMessage({
      business_id: business?.id ?? null,
      caller_name: args.caller_name,
      caller_phone: callerPhone,
      content: args.message,
      urgency,
      _vapi_call_id: call.id,
    });

    // Urgent messages can't wait for the end-of-call digest.
    const ownerPhone = normalizeE164(business?.owner_phone);
    if (urgency === "high" && ownerPhone) {
      const preview = args.message.length > 120 ? `${args.message.slice(0, 119)}…` : args.message;
      deps.background("notify.urgent_message", async () => {
        await deps.notifier.sendSms(
          ownerPhone,
          `[VoiceDesk] URGENT message from ${args.caller_name} ${formatPhoneForDisplay(callerPhone)}: "${preview}"`,
        );
      });
    }
  }

  const team = business?.name ?? "the team";
  return {
    result: `Message saved for ${team}. Tell ${args.caller_name} someone will get back to them${urgency === "high" ? " as soon as possible" : ""}, then ask if there is anything else.`,
  };
}
