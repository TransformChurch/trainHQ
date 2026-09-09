---
name: Reporting PDF conversion
description: LibreOffice runtime requirements for reliable report PDF generation.
---

Each report PDF conversion must launch LibreOffice with a unique user profile and socket port, and the UNO helper must receive LibreOffice's program directory through `PYTHONPATH` plus its `fundamentalrc` through `URE_BOOTSTRAP`.

**Why:** System Python cannot import `uno` by default, and LibreOffice may refuse a socket when another process owns the default profile. The old script swallowed that helper failure and exited successfully without producing a PDF.

**How to apply:** Isolate every conversion, make helper failures fatal, and verify the requested PDF exists and is non-empty before returning a successful download response.