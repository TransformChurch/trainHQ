---
name: Drive Wiki sync boundary
description: Durable ownership boundaries and scheduling rules for the Google Drive PDF-to-Wiki sync.
---

Use the Replit Google Drive connector only through the Node API adapter. The existing Python script remains the incremental manifest comparison and PDF text-extraction engine; synced results are committed to the Wiki database rather than maintained as a second runtime JSON source.

**Why:** The connector's Python package was unavailable in the project package registry, while the supported Node SDK worked. Keeping OAuth/list/download in Node avoids a duplicate service account, and keeping incremental comparison/extraction in Python preserves the supplied engine without duplicating its core logic.

**How to apply:** Pass Drive metadata and changed PDF paths into the script's manifest mode. Keep manual Wiki content distinct from Drive-managed records, abort the whole apply on extraction failures, and use the durable database lease for every manual or scheduled run.

Production's guaranteed daily execution should use the bundled one-shot sync command in a Replit Scheduled Deployment. The autoscaled API's startup/hourly due check is only a catch-up fallback because scale-to-zero cannot guarantee an exact morning run.

**Why:** Multiple autoscaled instances can overlap and may be idle at the scheduled time.

**How to apply:** Use the same one-shot command and database lease for scheduled execution; never create a separate synchronization implementation.