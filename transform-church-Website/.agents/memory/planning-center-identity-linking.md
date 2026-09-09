---
name: Planning Center identity linking
description: Security rule for connecting Church Center identities to existing local accounts.
---

Never automatically attach a Planning Center person to an existing local user
based only on an email match. Accept an existing account only when its stored
Planning Center person ID or legacy external subject already matches; otherwise
require an explicit administrator-mediated linking flow.

**Why:** Email addresses are mutable and can be reused. Treating an email-only
match as identity proof could transfer another user's role, history, and
integration tokens to the person signing in.

**How to apply:** Any future account-linking or identity migration work must
verify the immutable Planning Center person ID and reject ambiguous or
conflicting matches. Email can help an administrator find a candidate account,
but it cannot authorize the link.