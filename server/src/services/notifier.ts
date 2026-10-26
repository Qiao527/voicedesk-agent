import type { Logger } from "../lib/logger";
import { maskPhone } from "../domain/phone";

export interface Notifier {
  readonly channels: { sms: boolean; email: boolean };
  sendSms(to: string, body: string): Promise<boolean>;
  sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean>;
}

export interface NotifierConfig {
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  /** E.164 number or a Messaging Service SID ("MG..."). */
  twilioFrom?: string;
  resendApiKey?: string;
  emailFrom?: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Twilio SMS + Resend email over plain `fetch`. Both channels are optional;
 * a missing channel logs once per send instead of failing the call pipeline.
 * Delivery failures are reported as `false`, never thrown, because a failed
 * notification must not cause Vapi to retry the whole webhook.
 */
export function createNotifier(config: NotifierConfig, logger: Logger): Notifier {
  const smsEnabled = Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFrom);
  const emailEnabled = Boolean(config.resendApiKey && config.emailFrom);

  return {
    channels: { sms: smsEnabled, email: emailEnabled },

    async sendSms(to, body) {
      if (!smsEnabled) {
        logger.debug("notify.sms_skipped", { reason: "twilio_not_configured" });
        return false;
      }
      const sid = config.twilioAccountSid!;
      const from = config.twilioFrom!;
      const params = new URLSearchParams({ To: to, Body: body });
      params.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);

      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${sid}:${config.twilioAuthToken}`).toString("base64")}`,
          },
          body: params,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          logger.warn("notify.sms_failed", {
            to: maskPhone(to),
            status: res.status,
            body: (await res.text()).slice(0, 300),
          });
          return false;
        }
        logger.info("notify.sms_sent", { to: maskPhone(to) });
        return true;
      } catch (err) {
        logger.warn("notify.sms_failed", { to: maskPhone(to), error: String(err) });
        return false;
      }
    },

    async sendEmail({ to, subject, html }) {
      if (!emailEnabled) {
        logger.debug("notify.email_skipped", { reason: "resend_not_configured" });
        return false;
      }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.resendApiKey}`,
          },
          body: JSON.stringify({ from: config.emailFrom, to, subject, html }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          logger.warn("notify.email_failed", { status: res.status, body: (await res.text()).slice(0, 300) });
          return false;
        }
        logger.info("notify.email_sent");
        return true;
      } catch (err) {
        logger.warn("notify.email_failed", { error: String(err) });
        return false;
      }
    },
  };
}
