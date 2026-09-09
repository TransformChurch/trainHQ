---
name: Reporting data retention
description: Privacy and retention rules for prepared Planning Center attendance exports.
---

Prepared attendance data must stay in private object storage, remain accessible only to the manager or administrator who created it, and expire after 24 hours.

**Why:** Attendance exports contain minors' names and contact information. Durable or public intermediate files would create unnecessary privacy risk, while user scoping prevents one manager from downloading another manager's prepared report.

**How to apply:** Any future reporting endpoint, background job, or download flow must preserve private storage, creator checks, short retention, and cleanup of expired objects.