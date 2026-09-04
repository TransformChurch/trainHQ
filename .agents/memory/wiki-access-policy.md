---
name: Wiki access policy
description: Durable authorization and rollout rules for the staff Wiki.
---

Admins always have Wiki access. Every other user needs either a direct Wiki grant or membership in a group with a Wiki grant. Enforce this on both Wiki listings and direct article routes, and hide the navigation link when access is absent.

**Why:** Wiki articles contain internal staff policies, so hiding navigation alone is insufficient. Existing users were granted access during the initial access-control migration to avoid unexpectedly removing access during rollout; users created afterward require an explicit direct or group grant.

**How to apply:** Keep admin access non-revocable, resolve group membership at request time, and apply identical authorization to every future Wiki read/export/search endpoint.