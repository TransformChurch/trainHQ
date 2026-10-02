import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFieldDatumUpdate,
  exchangeAuthorizationCode,
  fieldDefinitionIdForModule,
  fetchCurrentPerson,
  findFieldDataId,
  findFieldDataIdAcrossPages,
  planningCenterPeopleUrl,
  PlanningCenterError,
  syncPlanningCenterModuleAssignment,
} from "./planningCenter";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("authorization-code exchange sends PKCE and normalizes token expiry", async () => {
  process.env.PCO_CLIENT_ID = "client-id";
  process.env.PCO_CLIENT_SECRET = "client-secret";
  process.env.PCO_REDIRECT_URI = "https://example.com/api/auth/planning-center/callback";
  process.env.SESSION_SECRET = "test-encryption-secret";

  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, "POST");
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "authorization-code");
    assert.equal(body.get("code_verifier"), "pkce-verifier");
    return new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 7200,
      scope: "people",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const before = Date.now();
  const result = await exchangeAuthorizationCode("authorization-code", "pkce-verifier");
  assert.equal(result.accessToken, "access-token");
  assert.equal(result.refreshToken, "refresh-token");
  assert.equal(result.scope, "people");
  assert.ok(result.expiresAt.getTime() >= before + 7_199_000);
});

test("current-person lookup uses People v2 and extracts identity data", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access-token");
    if (String(input) !== "https://api.planningcenteronline.com/people/v2/me") {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: {
        id: "98765",
        attributes: {
          first_name: "Jordan",
          last_name: "Rivera",
          primary_email: "Jordan@example.com",
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const person = await fetchCurrentPerson("access-token");
  assert.deepEqual(person, {
    id: "98765",
    firstName: "Jordan",
    lastName: "Rivera",
    email: "jordan@example.com",
    phone: null,
    address: null,
  });
});

test("current-person lookup fetches the person's email relationship", async () => {
  const requested: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requested.push(url);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access-token");
    if (url === "https://api.planningcenteronline.com/people/v2/me") {
      return new Response(JSON.stringify({
        data: {
          id: "98765",
          attributes: {
            first_name: "Jordan",
            last_name: "Rivera",
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/emails")) {
      return new Response(JSON.stringify({
        data: [
          {
            id: "email-1",
            attributes: {
              address: "alternate@example.com",
              primary: false,
              blocked: false,
            },
          },
          {
            id: "email-2",
            attributes: {
              address: "Jordan@example.com",
              primary: true,
              blocked: false,
            },
          },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/phone_numbers") || url.includes("/addresses")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const person = await fetchCurrentPerson("access-token");
  // per_page=100 is appended to the first page of each collection fetch
  // (audit finding 1.3 / AUDIT_LOG.md Phase 1) so a person with more than
  // 25 emails/phones/addresses doesn't cost an extra round trip.
  assert.deepEqual(requested.sort(), [
    "https://api.planningcenteronline.com/people/v2/me",
    "https://api.planningcenteronline.com/people/v2/people/98765/emails?per_page=100",
    "https://api.planningcenteronline.com/people/v2/people/98765/phone_numbers?per_page=100",
    "https://api.planningcenteronline.com/people/v2/people/98765/addresses?per_page=100",
  ].sort());
  assert.deepEqual(person, {
    id: "98765",
    firstName: "Jordan",
    lastName: "Rivera",
    email: "jordan@example.com",
    phone: null,
    address: null,
  });
});

test("current-person lookup refreshes the primary phone and address relationships", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/me")) {
      return new Response(JSON.stringify({
        data: {
          id: "98765",
          attributes: {
            first_name: "Jordan",
            last_name: "Rivera",
            primary_email: "jordan@example.com",
          },
        },
      }), { status: 200 });
    }
    if (url.includes("/phone_numbers")) {
      return new Response(JSON.stringify({
        data: [
          { attributes: { number: "555-0100", primary: false } },
          { attributes: { number: "(555) 0199", primary: true } },
        ],
      }), { status: 200 });
    }
    // per_page=100 is appended to the first page of a collection fetch
    // (audit finding 1.3) -- see withDefaultPerPage() in planningCenter.ts.
    assert.equal(url, "https://api.planningcenteronline.com/people/v2/people/98765/addresses?per_page=100");
    return new Response(JSON.stringify({
      data: [
        {
          attributes: {
            street_line_1: "123 Main Street",
            city: "Brooklyn",
            state: "NY",
            zip: "11201",
            primary: false,
          },
        },
        {
          attributes: {
            street_line_1: "456 Church Avenue",
            street_line_2: "Apt 2",
            city: "Queens",
            state: "NY",
            postal_code: "11375",
            primary: true,
          },
        },
      ],
    }), { status: 200 });
  };

  const person = await fetchCurrentPerson("access-token");
  assert.equal(person.phone, "(555) 0199");
  assert.equal(person.address, "456 Church Avenue, Apt 2, Queens, NY, 11375");
});

test("current-person lookup follows relationship pagination before selecting primary data", async () => {
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith("/me")) {
      return new Response(JSON.stringify({
        data: {
          id: "98765",
          attributes: {
            first_name: "Jordan",
            last_name: "Rivera",
            primary_email: "jordan@example.com",
          },
        },
      }), { status: 200 });
    }
    // First page now carries the per_page=100 default (audit finding 1.3),
    // so the offset=25 "next" page must be checked first -- it's the more
    // specific match.
    if (url.includes("/phone_numbers?offset=25")) {
      return new Response(JSON.stringify({
        data: [{ attributes: { number: "555-0199", primary: true } }],
        links: { next: null },
      }), { status: 200 });
    }
    if (url.includes("/phone_numbers")) {
      return new Response(JSON.stringify({
        data: [{ attributes: { number: "555-0100", primary: false } }],
        links: {
          next: "https://api.planningcenteronline.com/people/v2/people/98765/phone_numbers?offset=25",
        },
      }), { status: 200 });
    }
    if (url.includes("/addresses")) {
      return new Response(JSON.stringify({
        data: [],
        links: { next: null },
      }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const person = await fetchCurrentPerson("access-token");
  assert.equal(person.phone, "555-0199");
  assert.ok(requested.some((url) => url.includes("/phone_numbers?offset=25")));
});

test("People URL construction keeps relative paths in v2 and accepts only trusted next links", () => {
  assert.equal(
    planningCenterPeopleUrl("/people/98765/field_data").toString(),
    "https://api.planningcenteronline.com/people/v2/people/98765/field_data",
  );
  assert.equal(
    planningCenterPeopleUrl(
      "https://api.planningcenteronline.com/people/v2/people/98765/field_data?offset=25",
    ).toString(),
    "https://api.planningcenteronline.com/people/v2/people/98765/field_data?offset=25",
  );
  assert.throws(
    () => planningCenterPeopleUrl("https://example.com/people/v2/people/98765/field_data"),
    /invalid pagination URL/,
  );
});

test("field data uses the Planning Center relationship and FieldDatum resource type", () => {
  const response = [
    {
      id: "field-data-1",
      relationships: {
        field_definition: {
          data: { type: "FieldDefinition", id: "definition-123" },
        },
      },
    },
  ];
  const fieldDataId = findFieldDataId(response, "definition-123");
  assert.equal(fieldDataId, "field-data-1");
  assert.deepEqual(
    buildFieldDatumUpdate(fieldDataId!, new Date("2026-08-27T20:00:00.000Z")),
    {
      data: {
        type: "FieldDatum",
        id: "field-data-1",
        attributes: { value: "2026-08-27" },
      },
    },
  );
});

test("assignment and completion mappings resolve to separate custom fields", () => {
  process.env.PCO_MODULE_FIELD_DEFINITION_MAP = JSON.stringify({
    "42": { assigned: "assignment-field", completed: "completion-field" },
  });
  assert.equal(fieldDefinitionIdForModule(42, "assigned"), "assignment-field");
  assert.equal(fieldDefinitionIdForModule(42, "completed"), "completion-field");
});

test("legacy completion-only mappings remain completion-only", () => {
  process.env.PCO_MODULE_FIELD_DEFINITION_MAP = JSON.stringify({ "42": "completion-field" });
  assert.equal(fieldDefinitionIdForModule(42, "completed"), "completion-field");
  assert.throws(
    () => fieldDefinitionIdForModule(42, "assigned"),
    /assigned date field mapping/,
  );
});

test("bulk assignment sync outcomes remain independent across success, skip, and failure", async () => {
  const users = [
    { id: "user-1", planningCenterPersonId: "person-1" },
    { id: "user-2", planningCenterPersonId: null },
    { id: "user-3", planningCenterPersonId: "person-3" },
  ];
  const results = await Promise.all(users.map((user) =>
    syncPlanningCenterModuleAssignment(
      user,
      42,
      new Date("2026-08-30T12:00:00.000Z"),
      async (connectedUser) => {
        if (connectedUser.planningCenterPersonId === "person-3") {
          throw new PlanningCenterError(
            "planning_center_field_data_missing",
            "Add the mapped assignment field to this member's Planning Center profile.",
            409,
          );
        }
      },
    )
  ));
  assert.deepEqual(results, [
    { status: "synced" },
    {
      status: "skipped",
      message: "Church Center is not connected for this member.",
    },
    {
      status: "failed",
      code: "planning_center_field_data_missing",
      message: "Add the mapped assignment field to this member's Planning Center profile.",
    },
  ]);
});

test("field-data discovery follows pagination before reporting a missing mapping", async () => {
  const requested: string[] = [];
  const id = await findFieldDataIdAcrossPages(
    "/people/98765/field_data",
    "definition-456",
    async (path) => {
      requested.push(path);
      if (path === "/people/98765/field_data") {
        return {
          data: [],
          links: { next: "https://api.planningcenteronline.com/people/v2/people/98765/field_data?offset=25" },
        };
      }
      return {
        data: [{
          id: "field-data-page-two",
          relationships: {
            field_definition: { data: { id: "definition-456" } },
          },
        }],
        links: { next: null },
      };
    },
  );
  assert.equal(id, "field-data-page-two");
  assert.equal(requested.length, 2);
});

// --- Audit fix 1.1: request hardening (timeout/retry/backoff/429) --------
// These prove pcoFetch() actually self-heals a transient failure instead of
// immediately failing the caller, and that it still gives up (rather than
// retrying forever) once a failure proves durable.

test("a transient 500 from Planning Center is retried and the request still succeeds", async () => {
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/me")) {
      calls += 1;
      if (calls === 1) {
        return new Response("internal error", { status: 500 });
      }
      return new Response(JSON.stringify({
        data: { id: "98765", attributes: { first_name: "Jordan", last_name: "Rivera", primary_email: "jordan@example.com" } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  const person = await fetchCurrentPerson("access-token");
  assert.equal(calls, 2, "expected exactly one retry after the first 500");
  assert.equal(person.firstName, "Jordan");
});

test("a 429 honors the Retry-After header and the request still succeeds", async () => {
  let calls = 0;
  const timestamps: number[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/me")) {
      calls += 1;
      timestamps.push(Date.now());
      if (calls === 1) {
        return new Response("rate limited", { status: 429, headers: { "Retry-After": "0.2" } });
      }
      return new Response(JSON.stringify({
        data: { id: "98765", attributes: { first_name: "Jordan", last_name: "Rivera", primary_email: "jordan@example.com" } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  const person = await fetchCurrentPerson("access-token");
  assert.equal(calls, 2);
  assert.ok(
    timestamps[1] - timestamps[0] >= 180,
    `expected the retry to wait close to the 200ms Retry-After, waited ${timestamps[1] - timestamps[0]}ms`,
  );
  assert.equal(person.firstName, "Jordan");
});

test("a durably failing request gives up after the retry budget instead of retrying forever", async () => {
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/me")) {
      calls += 1;
      return new Response("still broken", { status: 503 });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  await assert.rejects(
    () => fetchCurrentPerson("access-token"),
    (err: unknown) => {
      assert.ok(err instanceof PlanningCenterError);
      return true;
    },
  );
  // 1 initial attempt + 3 retries = 4 total calls, then it must give up.
  assert.equal(calls, 4);
});