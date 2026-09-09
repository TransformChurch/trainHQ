---
name: Planning Center OAuth environments
description: Environment-specific callback requirements for reliable Church Center login.
---

Planning Center OAuth callback URLs must be configured separately for development and production. Production must use the stable published application URL, never a development preview domain.

**Why:** Development workspaces can stop while idle. If the published app sends its OAuth callback through a development URL, production login becomes unavailable whenever that workspace sleeps even though the autoscale deployment itself wakes normally.

**How to apply:** Keep `PCO_REDIRECT_URI` in environment-specific settings, ensure the Planning Center application accepts both callback URLs, restart development after changes, and republish to activate production changes.