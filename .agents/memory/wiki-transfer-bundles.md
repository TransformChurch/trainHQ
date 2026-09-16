---
name: Wiki transfer bundles
description: Invariants for safe, portable Wiki JSON imports and exports between environments.
---

Wiki transfers use slugs for categories and articles, user email for direct grants, and group name for group grants. Exported bundles must pass the same validation used for import without manual conversion.

**Why:** Internal database IDs differ between environments. Email and group-name matching can also be ambiguous when values differ only by case, so silently choosing one row could grant access to the wrong principal.

**How to apply:** Resolve grants case-insensitively, treat multiple matches as blocking errors, and resolve again inside the confirmation transaction. Export related rows from one consistent database snapshot. Keep large-body parsing scoped behind admin authorization rather than increasing the global JSON limit.

Multiple Wikis are independent permission and content domains. Every category, article, direct grant, and group grant must be scoped by the same stable Wiki key.

**Why:** Application-only filtering is not enough: an article attached to another Wiki's category could be hidden inconsistently or cascade-deleted by changes in the wrong Wiki.

**How to apply:** Scope every query and unique constraint by Wiki key, and enforce article/category ownership with a composite database foreign key on Wiki key plus category ID.