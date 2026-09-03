---
name: Reporting enrichment completeness
description: Completeness rule for Planning Center profile enrichment in attendance exports.
---

Attendance exports must either enrich every attendee with all requested Planning Center profile and custom-field data or fail preparation explicitly; they must never silently substitute blank data after throttling or transient API failures.

**Why:** Planning Center can rate-limit the per-person requests needed by larger reports. Silent error handling previously made later attendees appear to have incomplete profiles even though their data existed.

**How to apply:** Reporting fetches should paginate relevant relationships, retry rate limits and transient server failures, limit concurrency, and stop report preparation if any attendee still cannot be enriched.