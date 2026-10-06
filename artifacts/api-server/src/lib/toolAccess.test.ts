import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeToolAccessConfig, userHasToolAccess } from "./toolAccess";

test("normalizeToolAccessConfig drops unknown roles, non-strings, and duplicates", () => {
  assert.deepEqual(
    normalizeToolAccessConfig({ roles: ["manager", "admin", "bogus", "manager"], userIds: ["u1", "", 5, "u1", "u2"] }),
    { roles: ["manager"], userIds: ["u1", "u2"] },
  );
  assert.deepEqual(normalizeToolAccessConfig(null), { roles: [], userIds: [] });
  assert.deepEqual(normalizeToolAccessConfig("nope"), { roles: [], userIds: [] });
});

test("userHasToolAccess: admins always, otherwise by role or by person", () => {
  const none = { roles: [], userIds: [] } as const;
  assert.equal(userHasToolAccess({ id: "a", role: "admin" }, { ...none, roles: [], userIds: [] }), true);
  assert.equal(userHasToolAccess({ id: "m", role: "manager" }, { roles: [], userIds: [] }), false);
  assert.equal(userHasToolAccess({ id: "m", role: "manager" }, { roles: ["manager"], userIds: [] }), true);
  assert.equal(userHasToolAccess({ id: "s", role: "student" }, { roles: ["manager"], userIds: [] }), false);
  assert.equal(userHasToolAccess({ id: "s", role: "student" }, { roles: ["manager"], userIds: ["s"] }), true);
});
