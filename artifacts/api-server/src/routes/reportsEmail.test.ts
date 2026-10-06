import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_REPORT_EMAIL_RECIPIENTS, parseReportRecipients } from "./reports";

test("parseReportRecipients accepts a list or a comma/semicolon string and de-dupes", () => {
  assert.deepEqual(parseReportRecipients("Andrew@transformchurch.com, kids@transformchurch.com; andrew@transformchurch.com"), {
    recipients: ["andrew@transformchurch.com", "kids@transformchurch.com"],
  });
  assert.deepEqual(parseReportRecipients(["a@b.org", " c@d.org "]), { recipients: ["a@b.org", "c@d.org"] });
});

test("parseReportRecipients rejects empty, invalid, and too many addresses", () => {
  assert.ok("error" in parseReportRecipients(""));
  assert.ok("error" in parseReportRecipients("not-an-email"));
  assert.ok("error" in parseReportRecipients("Name <a@b.org>"));
  const many = Array.from({ length: MAX_REPORT_EMAIL_RECIPIENTS + 1 }, (_, i) => `p${i}@example.com`);
  assert.ok("error" in parseReportRecipients(many));
});
