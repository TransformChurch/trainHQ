---
name: Orval inline request body schema conflict
description: Orval generates both a zod validator AND a TypeScript type with the same auto-derived name when inline request body schemas are used, causing duplicate export errors in api-zod/src/index.ts.
---

## Rule
Never define inline request body schemas in OpenAPI endpoints. Always use a named `$ref` in `components/schemas`.

**Why:** Orval generates a const (zod schema) in `generated/api.ts` AND a type in `generated/types/<name>.ts` with the same derived name (e.g. `AddGroupMemberBody`). When `index.ts` re-exports both via `export * from "./generated/api"` and `export * from "./generated/types"`, TypeScript raises TS2308 (ambiguous export).

**How to apply:** For every new POST/PATCH/PUT endpoint, define the request body as a named schema in `components/schemas` and reference it with `$ref: "#/components/schemas/MyInputName"`. This gives orval a stable, non-conflicting name pair (zod const vs. inferred type).
