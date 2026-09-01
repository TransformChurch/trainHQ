---
name: Request Hub access layers
description: How broad and category-specific Request Hub permissions interact.
---

Whole-hub user or group grants continue to expose every Request Hub category. Category-specific user or group grants independently allow only the selected categories when no whole-hub grant applies. Admins always see every category.

**Why:** Existing whole-hub permissions must remain backward compatible while allowing narrower section access without requiring a second broad grant.

**How to apply:** When changing Request Hub authorization, evaluate admin access first, then whole-hub grants, then union direct and group category grants. Never make a category grant depend on a whole-hub grant.