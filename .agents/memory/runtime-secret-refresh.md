---
name: Runtime secret refresh
description: Replit workflow behavior after changing server-side secrets
---

Server-side secret changes do not affect an already-running workflow process until that workflow is restarted.

**Why:** OAuth debugging showed the configured secret had been updated, but the running API continued sending the previous client ID until its workflow restarted.

**How to apply:** After changing API credentials or signing/encryption secrets, restart the relevant server workflow before testing. A frontend rebuild is not needed when only server-side secrets change.