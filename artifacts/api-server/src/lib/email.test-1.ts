import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFromHeader, sendEmail, siteUrl } from "./email";

test("unset or empty EMAIL_FROM falls back to the default sender", () => {
  assert.equal(resolveFromHeader(undefined), "Transform Church <onboarding@resend.dev>");
  assert.equal(resolveFromHeader(""), "Transform Church <onboarding@resend.dev>");
  assert.equal(resolveFromHeader("   "), "Transform Church <onboarding@resend.dev>");
});

test("bare address gets the Transform Church display name", () => {
  assert.equal(resolveFromHeader("pulse@transformchurch.app"), "Transform Church <pulse@transformchurch.app>");
  assert.equal(resolveFromHeader('  "pulse@transformchurch.app" '), "Transform Church <pulse@transformchurch.app>");
});

test("a value that already has a display name is not double-wrapped", () => {
  assert.equal(resolveFromHeader("TC Reports <pulse@transformchurch.app>"), "TC Reports <pulse@transformchurch.app>");
  assert.equal(resolveFromHeader('"TC Reports" <pulse@transformchurch.app>'), "TC Reports <pulse@transformchurch.app>");
  assert.equal(resolveFromHeader("<pulse@transformchurch.app>"), "Transform Church <pulse@transformchurch.app>");
});

test("display names that would need quoting are reduced to safe characters", () => {
  assert.equal(resolveFromHeader("Transform Church, Youth <pulse@transformchurch.app>"), "Transform Church Youth <pulse@transformchurch.app>");
  assert.equal(resolveFromHeader("TC (Reports) <pulse@transformchurch.app>"), "TC Reports <pulse@transformchurch.app>");
  assert.equal(resolveFromHeader("pulse@tc.app <pulse@transformchurch.app>"), "pulse tc.app <pulse@transformchurch.app>");
  assert.equal(resolveFromHeader('"" <pulse@transformchurch.app>'), "Transform Church <pulse@transformchurch.app>");
});

test("an unusable value returns null instead of a header Resend will reject", () => {
  assert.equal(resolveFromHeader("transformchurch.app"), null);
  assert.equal(resolveFromHeader("Transform Church"), null);
  assert.equal(resolveFromHeader("a@b.com, c@d.com"), null);
  assert.equal(resolveFromHeader("mailto:pulse@transformchurch.app"), null);
  assert.equal(resolveFromHeader("pulse@transformchurch"), null);
  assert.equal(resolveFromHeader("pulse@transformchurch.app>"), null);
});

test("sendEmail base64-encodes attachments for Resend", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  let sentBody: any = null;
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Reporting@transformchurch.app";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(String(init.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const result = await sendEmail({
      to: ["a@example.com"],
      subject: "s",
      html: "<p>x</p>",
      attachments: [{ filename: "pulse.csv", content: "Source,Count\r\nKids,42\r\n" }],
    });
    assert.equal(result.sent, true);
    assert.equal(sentBody.from, "Transform Church <Reporting@transformchurch.app>");
    assert.equal(sentBody.attachments[0].filename, "pulse.csv");
    assert.equal(Buffer.from(sentBody.attachments[0].content, "base64").toString("utf8"), "Source,Count\r\nKids,42\r\n");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = originalFrom;
  }
});

test("every email is wrapped with church branding and the website link", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalSite = process.env.SITE_URL;
  let sentBody: any = null;
  process.env.RESEND_API_KEY = "test-key";
  delete process.env.SITE_URL;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(String(init.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await sendEmail({ to: "a@example.com", subject: "s", html: "<p>body text</p>" });
    assert.match(sentBody.html, /<p>body text<\/p>/);
    assert.match(sentBody.html, /alt="Transform Church"/);
    assert.match(sentBody.html, /href="https:\/\/transformchurch\.app"/);
    assert.match(sentBody.html, /transformchurch\.app<\/a>/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalSite === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = originalSite;
  }
});

test("siteUrl prefers SITE_URL, then the first CORS origin, then the production domain", () => {
  const originalSite = process.env.SITE_URL;
  const originalCors = process.env.CORS_ALLOWED_ORIGINS;
  try {
    process.env.SITE_URL = "https://example.org/";
    assert.equal(siteUrl(), "https://example.org");
    delete process.env.SITE_URL;
    process.env.CORS_ALLOWED_ORIGINS = "https://staging.example.org, https://other";
    assert.equal(siteUrl(), "https://staging.example.org");
    process.env.CORS_ALLOWED_ORIGINS = "";
    assert.equal(siteUrl(), "https://transformchurch.app");
  } finally {
    if (originalSite === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = originalSite;
    if (originalCors === undefined) delete process.env.CORS_ALLOWED_ORIGINS; else process.env.CORS_ALLOWED_ORIGINS = originalCors;
  }
});
