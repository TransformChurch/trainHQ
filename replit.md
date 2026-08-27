# Transform Church Training Platform

This project is intentionally self-hostable with Node.js, npm, PostgreSQL, and a persistent local storage volume.

## Run & Operate

- `npm run dev:api` — build and run the API server
- `npm run dev:web` — run the frontend Vite development server
- `npm run build` — typecheck and build all packages
- `npm start` — run the built API server
- `npm run db:migrate` — apply tracked database migrations
- `npm run db:generate` — generate a migration from schema changes

## Stack

- npm workspaces, Node.js 22.18+, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild API bundle and Vite static frontend

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/` — PostgreSQL schema source of truth
- `lib/db/migrations/` — tracked database migrations
- `artifacts/transform-church/src/index.css` — frontend theme
- `.env.example` — all runtime configuration

## Architecture decisions

- Authentication uses provider-neutral HS256 bearer JWTs, so the host site or an identity gateway can control sign-in.
- Uploads use a persistent local filesystem volume and short-lived HMAC-signed direct upload URLs.
- Cross-origin API access and iframe embedding require explicit origin allowlists.

## Product

Role-based learning tracks, videos, documents, groups, growth tracks, and administration.

## User preferences

No project-wide user preferences recorded.

## Gotchas

- Rebuild the frontend after changing `PUBLIC_URL` or `VITE_*` settings.
- Back up the PostgreSQL database and `STORAGE_ROOT` together.

## Pointers

- See `README.md` for portable installation and embedding guidance.
