---
name: Orval and Zod compatibility
description: Generator compatibility settings needed to keep API code generation compiling with this workspace's Zod and TypeScript setup.
---

Explicitly configure Orval's Zod output for version 3, and retain `DOM.Iterable` in the generated React client's TypeScript library set.

**Why:** Newer Orval releases can auto-detect the wrong Zod generation mode in this monorepo and emit Zod 4-only APIs. Their fetch output also uses iterable `Headers` methods that are absent from the plain `DOM` typings.

**How to apply:** When changing the OpenAPI specification, regenerate both clients normally. If generation starts emitting `zod.int()` or TypeScript rejects `Headers.entries()`, verify these compatibility settings before editing generated files.