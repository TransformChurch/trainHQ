// Shared Resend sender. Previously this exact fetch-to-Resend logic was
// copy-pasted in routes/admin.ts's sendAssignmentEmail() and
// routes/adminTracks.ts's sendTrackAssignmentEmail() -- this is the third
// call site (routes/weeklyPulse.ts), so it's been pulled out here rather
// than copied a third time. Those two existing call sites are untouched for
// now (same behavior either way); worth pointing both at this helper next
// time either file is touched for something else.

export interface EmailAttachment {
  filename: string;
  content: string | Buffer; // raw file content; base64-encoded for Resend below
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  sent: boolean;
  // Set when sent is false -- either "no RESEND_API_KEY configured" (not an
  // error, just unconfigured in this environment) or the actual fetch/HTTP
  // failure, so callers that need to know (e.g. to record lastRunError) can
  // tell the difference from a caller that's fine to fire-and-forget.
  error?: string;
}

const DEFAULT_FROM_NAME = "Transform Church";
const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";
// Deliberately stricter than RFC 5322: plain ASCII addresses only, which is
// all a church sending domain needs and all Resend's validator reliably
// accepts.
const ADDRESS = String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`;
const BARE_EMAIL = new RegExp(`^${ADDRESS}$`);
const NAMED_EMAIL = new RegExp(`^([^<>]*?)\\s*<\\s*(${ADDRESS})\\s*>$`);

// Display-name characters that need RFC 5322 quoting (commas, @, quotes,
// brackets, semicolons...) are a common way to get Resend's 422 "Invalid
// from field" even with a valid address, so reduce the name to characters
// that never need quoting instead of trying to quote it correctly.
function safeDisplayName(raw: string): string {
  const cleaned = raw
    .replace(/^"(.*)"$/, "$1")
    .replace(/[^A-Za-z0-9 .'&!_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || DEFAULT_FROM_NAME;
}

// Builds the Resend `from` header from EMAIL_FROM. Resend rejects anything
// that isn't `addr@example.com` or `Name <addr@example.com>` with a 422, and
// the old `Transform Church <${EMAIL_FROM}>` template produced exactly that
// in two real cases: the Worker passes EMAIL_FROM through as "" when the
// secret is unset (so `??` never fell back and the header became
// `Transform Church <>`), and a value that already carried a display name
// came out double-wrapped (`Transform Church <Name <addr>>`). Accepts a bare
// address, a full `Name <addr>` value, surrounding whitespace or quotes, and
// falls back to the Resend sandbox sender when unset. Returns null when the
// value is set but unusable so callers can report a clear error instead of
// a raw Resend 422.
export function resolveFromHeader(raw: string | undefined = process.env.EMAIL_FROM): string | null {
  let value = (raw ?? "").trim();
  if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1).trim();
  if (!value) return `${DEFAULT_FROM_NAME} <${DEFAULT_FROM_ADDRESS}>`;
  if (BARE_EMAIL.test(value)) return `${DEFAULT_FROM_NAME} <${value}>`;
  const named = NAMED_EMAIL.exec(value);
  if (named) {
    const name = safeDisplayName(named[1].trim());
    return `${name} <${named[2]}>`;
  }
  return null;
}

export async function sendEmail({ to, subject, html, attachments }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured" };

  const from = resolveFromHeader();
  if (!from) {
    return {
      sent: false,
      error: "EMAIL_FROM is set but is not a valid sender. Use an address like pulse@yourdomain.com or Name <pulse@yourdomain.com>.",
    };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(attachments?.length
          ? {
              attachments: attachments.map((attachment) => ({
                filename: attachment.filename,
                content: Buffer.from(attachment.content).toString("base64"),
              })),
            }
          : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // The sender line is included (it's an address, not a secret) so a
      // from-field rejection can be diagnosed straight from the admin UI.
      return { sent: false, error: `Resend returned ${response.status}: ${body.slice(0, 500)} (sent from: ${from})` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
