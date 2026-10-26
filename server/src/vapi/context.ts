import type { Business } from "../domain/types";
import type { Logger } from "../lib/logger";
import type { Repository } from "../repositories/repository";
import type { CalendarProvider } from "../services/calendar";
import type { CallAnalyzer } from "../services/call-analyzer";
import type { Notifier } from "../services/notifier";
import type { VoiceSettings } from "./assistant";
import { dialedNumber, type CallContext } from "./schemas";

/** Everything the webhook pipeline depends on. Injected so tests can swap any piece. */
export interface PipelineDeps {
  repo: Repository;
  calendar: CalendarProvider | null;
  notifier: Notifier;
  analyzer: CallAnalyzer | null;
  logger: Logger;
  voice: VoiceSettings;
  /** Base URL of the dashboard, used for links in owner emails. */
  dashboardUrl: string | null;
  now: () => Date;
  /**
   * Run work after the HTTP response has been sent. The default swallows
   * and logs errors; tests pass a collector so they can await completion.
   */
  background: (label: string, task: () => Promise<void>) => void;
}

/** Per-tool-call context. */
export interface ToolContext {
  deps: PipelineDeps;
  business: Business | null;
  call: CallContext;
  callerNumber: string | null;
}

/** Find the business that owns the number the caller dialed. */
export async function resolveBusiness(
  deps: PipelineDeps,
  message: { call: CallContext; phoneNumber?: { id?: string | null; number?: string | null } | null },
): Promise<Business | null> {
  const { number, phoneId } = dialedNumber(message);
  if (number) {
    const biz = await deps.repo.findBusinessByVapiNumber(number);
    if (biz) return biz;
  }
  if (phoneId) {
    const biz = await deps.repo.findBusinessByVapiPhoneId(phoneId);
    if (biz) return biz;
  }
  deps.logger.warn("vapi.business_not_found", { phoneId, hasNumber: Boolean(number) });
  return null;
}
