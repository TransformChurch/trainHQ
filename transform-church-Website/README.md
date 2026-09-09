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

## Planning Center / Church Center login

Transform Church includes a Planning Center OAuth 2.0 integration that uses the
authorization-code flow with PKCE and the `people` scope. Planning Center access
and refresh tokens are encrypted with `SESSION_SECRET` and stored only in
PostgreSQL. The browser receives the same short-lived application JWT used by
the provider-neutral authentication layer; Planning Center tokens are never
placed in browser storage, URLs, or logs.

1. Create an OAuth application in Planning Center and enable **Log In with
   Church Center**.
2. Add the exact callback URL that the API will use. Locally this is typically
   `http://localhost:3000/api/auth/planning-center/callback`; in production use
   the published API origin with the same path.
3. Add `PCO_CLIENT_ID`, `PCO_CLIENT_SECRET`, `PCO_REDIRECT_URI`, and a separate
   high-entropy `SESSION_SECRET` to the server environment.
4. Set `VITE_AUTH_LOGIN_URL=/api/auth/planning-center/start` when the frontend
   and API share an origin. If they are deployed separately, use the absolute
   API URL and include the frontend origin in `CORS_ALLOWED_ORIGINS`.
5. Apply migrations with `npm run db:migrate`, then rebuild the frontend.

The callback fetches `GET /people/v2/me`, links the returned Planning Center
person ID to the local account, and stores the encrypted OAuth tokens. For
security, an email-only match is not linked automatically; an administrator
must first assign the Planning Center person ID to the existing local account.
Access
tokens are refreshed automatically before they expire. If a member denies
consent or the People scope is missing, the sign-in page displays an actionable
error and the API logs only a safe error code.

### Mapping module assignment and completion custom fields

Create two People custom fields for each training module that should be
synchronized: one for the assignment date and one for the completion date. In
Planning Center People, open the custom field configuration and copy each
`field_definition_id`. Map each local Transform Church module ID to both
definition IDs in `PCO_MODULE_FIELD_DEFINITION_MAP`:

```dotenv
PCO_MODULE_FIELD_DEFINITION_MAP={"1":{"assigned":"123456","completed":"123457"},"2":{"assigned":"123458","completed":"123459"}}
```

The `assigned` field is updated when an administrator assigns or reassigns a
module, using the assignment's actual date. The `completed` field is updated
when the member completes the module. The two fields are never overwritten by
one another. Existing completion-only mappings such as
`{"1":"123456"}` remain valid for completion updates, but they do not enable
assignment-date updates until migrated to the two-field format.

When either lifecycle event runs, the API:

1. Refreshes the member's Planning Center access token when necessary.
2. Looks up the person's field-data record that matches the mapped
   `field_definition_id`.
3. Patches `/people/v2/field_data/{field_data_id}` with the relevant date in
   `YYYY-MM-DD` format.
4. For completion, records the local completion only after Planning Center
   accepts the update.

If an assigned-date mapping is absent, the local assignment still succeeds and
the admin result identifies the Planning Center update as skipped or failed.
If a completion mapping is absent or the custom field is not present on the
member's profile, the UI shows a clear error and no local completion is
recorded. For bulk assignments, one member's provider failure does not hide
the results for other members.

`FRAME_ANCESTORS` is applied automatically during Vite development and preview. In production, your static web host must return the same header for the frontend files because it is the iframe resource. For example, in an Nginx site block:

```nginx
add_header Content-Security-Policy "frame-ancestors 'self' https://www.example.com" always;
```

The API also returns this header for its own responses. Keep the origins in both locations synchronized.

## Database changes

`npm run db:generate` creates new Drizzle migrations from schema changes. `npm run db:migrate` applies tracked migrations. The checked-in baseline creates the schema for a fresh PostgreSQL database; it uses idempotent create statements so an existing installation can retain its data. The identity migration renames legacy identity columns before the baseline checks remaining tables. It does not provision PostgreSQL or move data between hosts.

## Storage

Uploaded files live beneath `STORAGE_ROOT` in separate public and private directories. In production, mount this directory to durable storage and back it up alongside PostgreSQL. The application validates paths and signs short-lived direct upload URLs with `STORAGE_SIGNING_SECRET`.