import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFromHeader } from "./email";

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

test("an unusable value returns null instead of a header Resend will reject", () => {
  assert.equal(resolveFromHeader("transformchurch.app"), null);
  assert.equal(resolveFromHeader("Transform Church"), null);
  assert.equal(resolveFromHeader("a@b.com, c@d.com"), null);
});
