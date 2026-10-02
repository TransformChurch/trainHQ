import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecipientsFromGroups } from "./groupBroadcasts";

// Audit finding 1.10 (AUDIT_LOG.md Phase 1): resolveRecipientsFromGroups()
// used to swallow every per-person lookup failure -- including an
// expired/revoked Planning Center access token (401/403) -- behind the same
// "Person <id>" / no-contact-info fallback used for a genuine per-person
// issue. These tests prove the fix: an auth failure now propagates instead
// of being silently reported as "no phone/email on file", while a
// non-auth, per-person failure (e.g. a 404 for a deleted person) still
// falls back the way it always did.

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function membershipsResponse(personIds: string[]) {
  return new Response(JSON.stringify({
    data: personIds.map((id) => ({
      id: `membership-${id}`,
      relationships: { person: { data: { id, type: "Person" } } },
    })),
    links: { next: null },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function personResponse(id: string, name: string, phone: string, email: string) {
  return new Response(JSON.stringify({
    data: {
      id,
      attributes: { first_name: name.split(" ")[0], last_name: name.split(" ")[1] ?? "" },
    },
    included: [
      { type: "PhoneNumber", attributes: { number: phone, location: "Mobile" } },
      { type: "Email", attributes: { address: email } },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("resolves group members' contact info for the happy path", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/memberships")) return membershipsResponse(["1", "2"]);
    if (url.endsWith("/people/1?include=emails,phone_numbers")) {
      return personResponse("1", "Jordan Rivera", "555-0100", "jordan@example.com");
    }
    if (url.endsWith("/people/2?include=emails,phone_numbers")) {
      return personResponse("2", "Casey Lee", "555-0101", "casey@example.com");
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const recipients = await resolveRecipientsFromGroups(["group-1"], "access-token");
  assert.deepEqual(recipients.sort((a, b) => a.name.localeCompare(b.name)), [
    { name: "Casey Lee", phone: "555-0101", email: "casey@example.com" },
    { name: "Jordan Rivera", phone: "555-0100", email: "jordan@example.com" },
  ]);
});

test("a genuine per-person failure (404) still falls back to a placeholder, not an auth error", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/memberships")) return membershipsResponse(["1"]);
    return new Response("not found", { status: 404 });
  };

  const recipients = await resolveRecipientsFromGroups(["group-1"], "access-token");
  assert.deepEqual(recipients, [{ name: "Person 1", phone: null, email: null }]);
});

test("an expired/revoked Planning Center token (403) propagates instead of being reported as missing contact info", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/memberships")) return membershipsResponse(["1", "2"]);
    return new Response("forbidden", { status: 403 });
  };

  await assert.rejects(
    () => resolveRecipientsFromGroups(["group-1"], "access-token"),
    (err: unknown) => {
      // Before the fix, this call resolved successfully with
      // [{ name: "Person 1", phone: null, email: null }, ...] -- silently
      // misreporting an expired connection as "nobody has contact info."
      assert.equal((err as { status?: number }).status, 403);
      return true;
    },
  );
});
