import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFromHeader, sendEmail } from "./email";

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
