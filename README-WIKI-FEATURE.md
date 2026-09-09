# Staff Wiki — file delivery

This zip contains every file needed to add the new **Wiki** feature to Transform Church Training. Every path inside this zip mirrors its real location in your project — drop each file into that same path in your repo (overwriting where a file already exists), commit, and push.

## What this adds

- A new **Wiki** page (`/wiki`) with 8 categories and 68 articles, built from the actual staff policy documents (Employee Handbook, Staff Team Code, Maternity/Paternity policy, TC Kids & TransformYouth policies, meeting/communication guidelines, etc.) — real readable text, not just PDF links.
- A **Requests & Forms Directory** category inside the wiki that mirrors your live Request Hub's current categories and forms (pulled directly from your database), so staff can browse everything — policies and forms — from one place.
- A matching **Admin → Wiki** page (`/admin/wiki`, admin-only) to add, edit, reorder, hide, or delete categories and articles — same pattern as your existing Admin → Request Hub page.
- New "Wiki" links in the sidebar (visible to everyone) and admin sidebar (admin-only).

It's built exactly like your existing Documents/Request Hub features: a Postgres table pair (`wiki_categories`, `wiki_articles`), a couple of Express routes, and React pages — nothing Cloudflare-incompatible, nothing that needs a new npm package.

## Files in this zip

**New files:**
- `lib/db/src/schema/wiki.ts` — the two new tables
- `lib/db/migrations/0016_wiki.sql` — creates the tables and seeds all 8 categories / 68 articles
- `artifacts/api-server/src/routes/wiki.ts` — public read API (`GET /api/wiki`, `GET /api/wiki/articles/:slug`)
- `artifacts/api-server/src/routes/adminWiki.ts` — admin CRUD API (`/api/admin/wiki/...`)
- `artifacts/transform-church/src/lib/wiki.ts` — frontend API client + types
- `artifacts/transform-church/src/components/wiki/WikiMarkdown.tsx` — renders article content (a small, deliberately limited markdown subset: `## `/`### ` headings, `- ` bullets, `1. ` numbered lists, `**bold**`, `[text](url)` links — nothing else, no new dependency needed)
- `artifacts/transform-church/src/pages/Wiki.tsx` — the public Wiki index/browse page
- `artifacts/transform-church/src/pages/WikiArticle.tsx` — the public article detail page
- `artifacts/transform-church/src/pages/AdminWiki.tsx` — the admin management page

**Modified files (full replacement — just overwrite):**
- `lib/db/src/schema/index.ts` — added `export * from "./wiki"`
- `lib/db/migrations/meta/_journal.json` — added the migration's journal entry (idx 16)
- `artifacts/api-server/src/routes/index.ts` — mounted `wikiRouter` at `/wiki`
- `artifacts/api-server/src/routes/admin.ts` — mounted `adminWikiRouter` at `/admin/wiki`
- `artifacts/transform-church/src/App.tsx` — added `/wiki`, `/wiki/:slug`, `/admin/wiki` routes
- `artifacts/transform-church/src/components/layout/Sidebar.tsx` — added "Wiki" nav links
- `artifacts/transform-church/src/lib/siteCopy.tsx` — added a `nav.wiki` copy key ("Wiki")

## Setup after copying the files in

1. Run your normal migration command from the project root:
   ```
   npm run db:migrate
   ```
   This applies `0016_wiki.sql`, which is safe to run more than once (it only inserts rows that don't already exist).
2. Rebuild/restart as usual (`npm run dev`, or your normal deploy flow).
3. Sign in and check the "Wiki" link in the sidebar, and "Wiki" under Admin.

## How the migration was verified

I ran your full migration history (0001 through 0016, in order) against a fresh, empty Postgres 16 database in my own sandbox before sending this — every migration applied cleanly, `0016_wiki.sql` is idempotent (re-running it makes no changes and throws no errors), every article's category reference is valid (no orphaned rows), and I round-tripped the seeded article text back out of the database to confirm nothing was mangled by SQL escaping. I also parsed all 68 articles' content through the same block-parsing logic `WikiMarkdown.tsx` uses, to confirm every article renders as clean headings/lists/paragraphs with no leftover or broken markdown syntax.

## One thing I could not verify

I don't have your `node_modules` installed in my sandbox (network policy blocks the package registry from here), so I could not run a real TypeScript compile or confirm every `lucide-react` icon name I used (`Baby`, `Compass`, `GraduationCap`, `Library`, `Megaphone`, `ClipboardList`, `Clock`, `ShieldCheck`, etc.) exists in your installed version. These are all long-standing, common icon names, so I'm confident they're fine — but it's worth a quick `npm run typecheck` after copying the files in, before you deploy. If any icon name is wrong, TypeScript will fail loudly on that one import line, and swapping it for another `lucide-react` icon is a one-line fix.

## Content notes

- I deliberately left the **Passwords** folder out of the wiki — that's sensitive material that shouldn't live as plain readable text in a web page, unlike the PDF-copy task from earlier in this session.
- The **TransformYouth Policies** subfolder's documents (GST SOP, Special Needs, Sunday Team Serving Policy, Private Property Usage Agreement, Youth Handbook) are included and were pulled directly from `G:\Shared drives\Staff`, since those hadn't been copied into your `Document Upload` folder yet.
- All dollar amounts, deadlines, day/week counts, phone numbers, emails, and named contacts from the source documents were preserved exactly as written — nothing was summarized away. Certification/signature-line blocks (e.g. "I have read and understood...") were dropped since they're not informational content.
- The **Comms Requests** and **Production Requests** categories in the Requests & Forms Directory currently show "no form published yet" because that's genuinely what's in your live database right now — add the real forms there (or in the Request Hub admin) whenever they're ready, and they'll need to be added to the wiki article manually too (or just link people to the Request Hub directly for those two).
