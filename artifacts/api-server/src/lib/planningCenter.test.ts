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
    if (url.endsWith("/emails")) {
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
    if (url.endsWith("/phone_numbers") || url.endsWith("/addresses")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const person = await fetchCurrentPerson("access-token");
  assert.deepEqual(requested.sort(), [
    "https://api.planningcenteronline.com/people/v2/me",
    "https://api.planningcenteronline.com/people/v2/people/98765/emails",
    "https://api.planningcenteronline.com/people/v2/people/98765/phone_numbers",
    "https://api.planningcenteronline.com/people/v2/people/98765/addresses",
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
    if (url.endsWith("/phone_numbers")) {
      return new Response(JSON.stringify({
        data: [
          { attributes: { number: "555-0100", primary: false } },
          { attributes: { number: "(555) 0199", primary: true } },
        ],
      }), { status: 200 });
    }
    assert.equal(url, "https://api.planningcenteronline.com/people/v2/people/98765/addresses");
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
    if (url.endsWith("/phone_numbers")) {
      return new Response(JSON.stringify({
        data: [{ attributes: { number: "555-0100", primary: false } }],
        links: {
          next: "https://api.planningcenteronline.com/people/v2/people/98765/phone_numbers?offset=25",
        },
      }), { status: 200 });
    }
    if (url.includes("/phone_numbers?offset=25")) {
      return new Response(JSON.stringify({
        data: [{ attributes: { number: "555-0199", primary: true } }],
        links: { next: null },
      }), { status: 200 });
    }
    if (url.endsWith("/addresses")) {
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