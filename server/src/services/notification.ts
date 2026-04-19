/**
 * Notification service — sends SMS (Twilio) and email (Resend) alerts
 * to the business owner when something needs attention.
 */

// ─── SMS via Twilio ──────────────────────────────────────────────────

export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.warn("Twilio not configured — skipping SMS");
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Twilio SMS failed (${res.status}): ${text}`);
  }
}

// ─── Email via Resend ────────────────────────────────────────────────

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Resend not configured — skipping email");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "VoiceDesk <noreply@voicedesk.ai>",
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Resend email failed (${res.status}): ${text}`);
  }
}

// ─── Convenience ─────────────────────────────────────────────────────

export async function notifyNewMessage(params: {
  businessPhone?: string;
  businessEmail?: string;
  callerName: string;
  messagePreview: string;
}) {
  const body = `New message from ${params.callerName}: "${params.messagePreview}"`;

  const tasks: Promise<void>[] = [];

  if (params.businessPhone) {
    tasks.push(sendSms(params.businessPhone, body));
  }

  if (params.businessEmail) {
    tasks.push(
      sendEmail({
        to: params.businessEmail,
        subject: `New voicemail from ${params.callerName}`,
        html: `<p>${body}</p>`,
      }),
    );
  }

  await Promise.allSettled(tasks);
}
