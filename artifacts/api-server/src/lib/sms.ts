// Shared Twilio sender, deliberately written against Twilio's plain REST API
// (Basic Auth + a form-encoded POST) rather than adding the `twilio` npm
// package -- same minimal-dependency choice as lib/email.ts's hand-rolled
// Resend call, and it's one endpoint.
//
// Config lives in three env vars (set as Worker secrets, never in
// wrangler.toml -- see that file's header comment):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN -- from the Twilio console.
//   TWILIO_MESSAGING_SERVICE_SID -- preferred once set up (Twilio picks the
//     sending number for you, handles a pool of numbers, and is how most
//     A2P 10DLC registrations end up being used in practice).
//   TWILIO_FROM_NUMBER -- a single E.164 phone number, used only if
//     TWILIO_MESSAGING_SERVICE_SID isn't set.
// At least one of the latter two must be set. Neither alone makes sending
// actually work in the US at volume -- Twilio requires A2P 10DLC
// registration (a brand + campaign, submitted through the Twilio console)
// before a long-code number can send non-trivial SMS traffic to US numbers;
// that's a one-time account-level step outside what this code can do.

export interface SendSmsInput {
  to: string; // E.164, e.g. "+15551234567"
  body: string;
}

export interface SendSmsResult {
  sent: boolean;
  sid?: string;
  // Set when sent is false -- either "not configured" (no error, just
  // missing secrets in this environment) or Twilio's own error message, so
  // callers can tell the difference and surface something useful per
  // recipient rather than a generic failure.
  error?: string;
}

export function isSmsConfigured(): boolean {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const sender = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER;
  return Boolean(accountSid && authToken && sender);
}

export interface SmsPriceEstimate {
  pricePerSegment: number;
  currency: string;
}

// Cached for the life of the container instance (there's only one -- see
// wrangler.toml's max_instances = 1) rather than re-fetched on every preview
// click. Twilio's own published pricing doesn't change minute to minute, so
// a 10-minute TTL just avoids hammering their Pricing API while an admin is
// actively composing a message.
let cachedPrice: (SmsPriceEstimate & { fetchedAt: number }) | null = null;
const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;

// Pulls this account's current outbound US SMS price from Twilio's Pricing
// API (a long-standing, documented API -- unlike the Planning Center Groups
// guesses elsewhere in this codebase, this one isn't a guess at the shape).
// What it CANNOT give us is the price for one specific recipient: Twilio's
// per-carrier pricing varies by the destination's actual mobile carrier,
// which isn't known without a separate paid Lookup API call per number. This
// returns the carrier-agnostic baseline "local" price Twilio lists for the
// country as a representative ballpark -- good enough to show "roughly $X"
// before sending, not a billing-accurate figure. Returns null (rather than a
// guessed number) if Twilio isn't configured or the response doesn't parse
// the way expected, so the caller can show "estimate unavailable" instead of
// a wrong number.
export async function getEstimatedSmsPrice(): Promise<SmsPriceEstimate | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  if (cachedPrice && Date.now() - cachedPrice.fetchedAt < PRICE_CACHE_TTL_MS) {
    return { pricePerSegment: cachedPrice.pricePerSegment, currency: cachedPrice.currency };
  }
  try {
    const response = await fetch("https://pricing.twilio.com/v1/Messaging/Countries/US", {
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      price_unit?: string;
      outbound_sms_prices?: Array<{
        carrier?: string;
        prices?: Array<{ number_type?: string; current_price?: string; base_price?: string }>;
      }>;
    };
    const entries = Array.isArray(data.outbound_sms_prices) ? data.outbound_sms_prices : [];
    const baseline = entries.find((entry) => !entry.carrier) ?? entries[0];
    const localPrice = baseline?.prices?.find((price) => price.number_type === "local") ?? baseline?.prices?.[0];
    const priceStr = localPrice?.current_price ?? localPrice?.base_price;
    const parsed = priceStr !== undefined ? Number(priceStr) : NaN;
    if (!Number.isFinite(parsed)) return null;
    cachedPrice = { pricePerSegment: parsed, currency: data.price_unit || "USD", fetchedAt: Date.now() };
    return { pricePerSegment: parsed, currency: cachedPrice.currency };
  } catch {
    return null;
  }
}

// Best-effort GSM-7 vs. UCS-2 segmentation, matching Twilio's own rules
// closely enough for a cost estimate (not a guarantee of the exact encoding
// Twilio will choose). A message using only GSM 03.38 "basic character set"
// characters sends as GSM-7 (160 chars/segment, 153 when concatenated across
// multiple segments); anything else -- emoji, most non-Latin scripts, some
// punctuation -- sends as UCS-2 (70 chars/segment, 67 concatenated).
const GSM7_PATTERN = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#$%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

export function countSmsSegments(body: string): number {
  if (!body) return 0;
  const isGsm7 = GSM7_PATTERN.test(body);
  const singleSegmentLimit = isGsm7 ? 160 : 70;
  const concatenatedLimit = isGsm7 ? 153 : 67;
  if (body.length <= singleSegmentLimit) return 1;
  return Math.ceil(body.length / concatenatedLimit);
}

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken) return { sent: false, error: "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN is not configured" };
  if (!messagingServiceSid && !fromNumber) {
    return { sent: false, error: "Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM_NUMBER is configured" };
  }

  const params = new URLSearchParams();
  params.set("To", to);
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", fromNumber!);
  params.set("Body", body);

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const payload = await response.json().catch(() => null) as { sid?: string; message?: string; code?: number } | null;
    if (!response.ok) {
      const detail = payload?.message ? `Twilio ${payload.code ?? response.status}: ${payload.message}` : `Twilio returned ${response.status}`;
      return { sent: false, error: detail };
    }
    return { sent: true, sid: payload?.sid };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
