---
name: Document file handling
description: The durable preview and display policy for repository files.
---

The document repository accepts every file type. Preserve MIME metadata and filename extensions when available. Only PDF files may use an embedded preview; every other type remains visible but opens externally.

**Why:** Image, office, archive, and other files belong in the shared repository, but embedded viewing should remain predictable and limited to the supported PDF experience.

**How to apply:** Use MIME type first and the filename extension as a backward-compatible fallback when deciding whether to preview. Apply the same rule on the Documents page and in document-based training modules.

Searchable PDF text must be extracted asynchronously by a bounded, database-backed worker and queried with server-side full-text search. Never download or parse PDFs during a student search request.

**Why:** Search-time extraction lets authenticated users trigger expensive downloads and parsing, while stale extraction jobs can publish text from a replaced file. Extracted text is internal index data and must never be included in ordinary document responses.

**How to apply:** Restrict search to the exact direct, group, and immediate-folder-child visibility rules. Keep source-conditional writes, bounded retries, and grouping-only parent folders free of ungranted Drive links.