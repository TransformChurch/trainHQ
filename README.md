# Transform Church Training Platform

A self-hostable training platform for learning tracks, videos, documents, groups, and role-based administration.

## Requirements

- Node.js 22.18 or newer
- npm 10 or newer
- PostgreSQL 16 or compatible
- A persistent filesystem volume for uploaded files

## Setup

1. Copy `.env.example` to a single root `.env` and supply secure values for `DATABASE_URL`, `AUTH_JWT_SECRET`, and `STORAGE_SIGNING_SECRET`. API startup and all database scripts load this root file automatically; do not create separate `.env` files inside workspace packages.
2. Install dependencies with `npm install`.
3. Create or migrate the database with `npm run db:migrate`.
4. Build every package with `npm run build`.

### Create the first administrator

Before the first sign-in, set either `INITIAL_ADMIN_EXTERNAL_USER_ID` (preferred) or `INITIAL_ADMIN_EMAIL` in the root `.env` to the exact value your identity provider will send for the church administrator. The first matching new user becomes an administrator; all other new users remain students. Remove the bootstrap setting after that administrator signs in successfully.
5. Start the API with `npm start`. For frontend development, run `npm run dev:web` in a separate terminal.

The production frontend build is written to `artifacts/transform-church/dist/public`. Serve that directory from your preferred static web server, or deploy it separately from the API.

## Hosting below a CMS path or domain

Set `PUBLIC_URL` to the path where the frontend will be served, such as `/training/`, and rebuild the frontend. Set `VITE_API_URL` when the API is on another origin; otherwise leave it empty for same-origin `/api` requests.

For a WordPress iframe or cross-domain integration:

- Add the WordPress site origin to `CORS_ALLOWED_ORIGINS`.
- Add that same origin to `FRAME_ANCESTORS`.
- Keep `CORS_ALLOW_CREDENTIALS=false` when using bearer tokens.
- Configure `VITE_AUTH_LOGIN_URL` to your external login flow. It must return a short-lived HS256 JWT in the frontend URL fragment as `#access_token=<token>` (or `#token=<token>`). The JWT must include `sub`, `email`, `given_name`, and `family_name` claims and be signed with `AUTH_JWT_SECRET`.

The token is held only in browser session storage and is sent as a bearer token to the API. This keeps the authentication integration independent of any hosted identity platform; an external site or identity gateway can mint the token after authenticating the user.

`FRAME_ANCESTORS` is applied automatically during Vite development and preview. In production, your static web host must return the same header for the frontend files because it is the iframe resource. For example, in an Nginx site block:

```nginx
add_header Content-Security-Policy "frame-ancestors 'self' https://www.example.com" always;
```

The API also returns this header for its own responses. Keep the origins in both locations synchronized.

## Database changes

`npm run db:generate` creates new Drizzle migrations from schema changes. `npm run db:migrate` applies tracked migrations. The checked-in baseline creates the schema for a fresh PostgreSQL database; it uses idempotent create statements so an existing installation can retain its data. The identity migration renames legacy identity columns before the baseline checks remaining tables. It does not provision PostgreSQL or move data between hosts.

## Storage

Uploaded files live beneath `STORAGE_ROOT` in separate public and private directories. In production, mount this directory to durable storage and back it up alongside PostgreSQL. The application validates paths and signs short-lived direct upload URLs with `STORAGE_SIGNING_SECRET`.