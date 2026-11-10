// Shared Resend sender. Every outgoing email goes through sendEmail(), and
// sendEmail() wraps the caller's HTML in the Transform Church branded layout
// (logo header + footer with a link to the website), so no email can go out
// without the website on it. Callers pass only their message body.

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
const DEFAULT_SITE_URL = "https://transformchurch.app";
// Brand colors: the black-and-white look of transformchurch.com, matching the
// site's --primary (black) and --primary-foreground (white).
const BRAND_BLACK = "#000000";
const BRAND_INK = "#0a0a0a";
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Public URL of the website (the front end, not the API). SITE_URL wins when
// set; otherwise the first CORS origin (that is the front end's origin in
// every deployment), otherwise the production domain -- so a link is always
// present even in an environment that forgot to configure one.
export function siteUrl(): string {
  const candidates = [process.env.SITE_URL, (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")[0]];
  for (const candidate of candidates) {
    const value = (candidate ?? "").trim();
    if (/^https?:\/\/[^\s"<>]+$/.test(value)) return value.replace(/\/+$/, "");
  }
  return DEFAULT_SITE_URL;
}

// Wraps a message body in the branded email layout. Table-based with inline
// styles because that is what Outlook and Gmail render reliably. The logo is
// served from the website itself; its alt text keeps the header readable when
// a mail client blocks images.
export function brandEmailHtml(bodyHtml: string, site: string = siteUrl()): string {
  const href = escapeHtml(site);
  const label = escapeHtml(site.replace(/^https?:\/\//, ""));
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Transform Church</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#111827;">
      <tr><td style="height:6px;line-height:6px;font-size:0;background:${BRAND_BLACK};">&nbsp;</td></tr>
      <tr><td align="center" style="padding:24px 24px 16px;border-bottom:1px solid #e5e7eb;">
        <a href="${href}" style="text-decoration:none;color:${BRAND_INK};">
          <img src="${href}/tc-wordmark.png" width="240" alt="Transform Church" style="display:block;width:240px;max-width:100%;height:auto;border:0;font-size:22px;font-weight:bold;color:${BRAND_INK};">
        </a>
      </td></tr>
      <tr><td style="padding:24px;font-size:15px;line-height:1.5;">
${bodyHtml}
      </td></tr>
      <tr><td align="center" style="padding:20px 24px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.5;color:#4b5563;">
        <a href="${href}" style="display:inline-block;padding:10px 20px;background:${BRAND_BLACK};color:#ffffff;text-decoration:none;font-weight:bold;border-radius:10px;">Visit Transform Church</a>
        <p style="margin:12px 0 0;">Transform Church &middot; <a href="${href}" style="color:${BRAND_INK};">${label}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// A call-to-action button for use inside an email body.
export function emailButton(label: string, href: string): string {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;background:${BRAND_BLACK};color:#ffffff;text-decoration:none;font-weight:bold;border-radius:10px;">${escapeHtml(label)}</a></p>`;
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
        html: brandEmailHtml(html),
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
