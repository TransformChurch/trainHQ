// Shared Resend sender. Previously this exact fetch-to-Resend logic was
// copy-pasted in routes/admin.ts's sendAssignmentEmail() and
// routes/adminTracks.ts's sendTrackAssignmentEmail() -- this is the third
// call site (routes/weeklyPulse.ts), so it's been pulled out here rather
// than copied a third time. Those two existing call sites are untouched for
// now (same behavior either way); worth pointing both at this helper next
// time either file is touched for something else.

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  sent: boolean;
  // Set when sent is false -- either "no RESEND_API_KEY configured" (not an
  // error, just unconfigured in this environment) or the actual fetch/HTTP
  // failure, so callers that need to know (e.g. to record lastRunError) can
  // tell the difference from a caller that's fine to fire-and-forget.
  error?: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured" };

  const fromAddr = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Transform Church <${fromAddr}>`,
        to,
        subject,
        html,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { sent: false, error: `Resend returned ${response.status}: ${body.slice(0, 500)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
