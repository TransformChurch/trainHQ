---
name: Reporting script uploads
description: Approved security model for administrator-managed Python reporting processors.
---

Administrators are intentionally allowed to replace each reporting Python processor with an arbitrary trusted `.py` upload from the Reporting page. Bundled versions remain available as reset defaults.

**Why:** The user explicitly chose admin-only arbitrary Python uploads after being informed that these scripts execute with the API server's file, environment, network, and data access.

**How to apply:** Keep script management admin-only, store uploads privately, enforce file type and size limits, compile-check syntax before activation, identify the active filename/version in the UI, and retain a one-click reset to bundled code.