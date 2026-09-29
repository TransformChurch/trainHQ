---
name: Wiki access policy
description: Durable authorization and rollout rules for the staff Wiki.
---

Admins always have Wiki access. Whole-Wiki direct or group grants include every category; category-specific direct or group grants expose only their assigned categories. Enforce this on both Wiki listings and direct article routes, and show navigation when at least one active category is accessible.

**Why:** Wiki articles contain internal staff policies, so hiding navigation alone is insufficient. Existing whole-Wiki grants must remain effective when category-specific permissions are added to avoid unexpectedly removing access.

**How to apply:** Keep admin access non-revocable, resolve group membership at request time, scope all category grants to the requested Wiki, and apply identical authorization to every future user-facing Wiki read/search endpoint.