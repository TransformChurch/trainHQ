---
name: Document file handling
description: The durable preview and display policy for repository files.
---

The document repository accepts every file type. Preserve MIME metadata and filename extensions when available. Only PDF files may use an embedded preview; every other type remains visible but opens externally.

**Why:** Image, office, archive, and other files belong in the shared repository, but embedded viewing should remain predictable and limited to the supported PDF experience.

**How to apply:** Use MIME type first and the filename extension as a backward-compatible fallback when deciding whether to preview. Apply the same rule on the Documents page and in document-based training modules.