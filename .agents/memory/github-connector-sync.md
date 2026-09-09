---
name: GitHub connector sync
description: Reliable integration workflow when conventional Git authentication is unavailable.
---

When the repository remote cannot authenticate through normal Git, use the authenticated GitHub connection to read the latest commit, its parent, and changed file contents. Compare each local file to the remote parent before applying changes.

**Why:** The local and GitHub histories may be unrelated, and blindly replacing files can erase newer local work. Migration numbers can also collide even when source files do not.

**How to apply:** Treat parent-matching files as clean three-way applications, manually merge genuinely diverged files, renumber conflicting migrations while preserving journal order, and verify the entire workspace before committing locally.