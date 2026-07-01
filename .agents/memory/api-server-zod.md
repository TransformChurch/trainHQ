---
name: API server zod imports
description: api-server has no direct zod dependency; use @workspace/api-zod or inline JS checks
---

api-server's package.json does NOT include `zod` as a direct dependency.

**Rule:** Never `import { z } from "zod"` or `import { z } from "zod/v4"` in any route file under `artifacts/api-server/src/`.

**Why:** esbuild (used to bundle the server) will throw `Could not resolve "zod/v4"` at build time, failing the entire server start.

**How to apply:**
- For request body validation, use types from `@workspace/api-zod` (pre-compiled Zod schemas surfaced as types).
- For new endpoints that need validation inline, do manual JS checks: `typeof name === "string" && name.trim()`, `typeof id === "number" && Number.isInteger(id)`, etc.
- Only `lib/db/src/schema/*.ts` files use `zod/v4` (they declare it as a dep in lib/db/package.json).
