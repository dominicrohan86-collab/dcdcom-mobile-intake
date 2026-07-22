# DCDcom Mobile Intake

A mobile-first inquiry workflow for data-center decommissioning projects. Customer calls, emails, notes, and attachments become structured inquiries with missing-information tracking, estimates, site visits, versioned documents, proposals, communications, files, integrations, activity, and audit history.

## Stack

The application uses package-backed layers throughout:

- **UI:** React 19, Vite, Tailwind CSS 4, Radix UI primitives, Lucide icons, TanStack Query, React Hook Form, Zod, Ky, CVA, `clsx`, and `tailwind-merge`.
- **API:** Hono with `@hono/zod-validator`, shared Zod contracts, secure-header middleware, and Cloudflare Worker-compatible request handling.
- **Database:** Drizzle ORM and Drizzle Kit over Cloudflare D1/SQLite, with a 28-table schema and generated SQL migrations.
- **Files:** Cloudflare R2 in production and a filesystem-backed R2 adapter locally.
- **Build:** Vite for the client and esbuild for the bundled Worker.

The retired vanilla DOM renderer, string-template components, global event binder, manual URL router, custom JSON validation helpers, hand-authored SQL repository, and schema materializer have been removed.

## Commands

```bash
npm run dev          # Vite UI and local Worker API at http://127.0.0.1:4173
npm run db:generate  # Generate a migration after changing db/schema/drizzle-schema.js
npm run db:check     # Validate Drizzle migrations
npm run test:api     # End-to-end API workflow tests
npm run test:mobile-ui # Source-level mobile workflow regression checks
npm run readiness    # D1, R2, identity, account, and AI readiness
npm run build        # Production client and Worker bundles
npm run verify       # Architecture, API, readiness, and production build gates
```

## Project Structure

- `src/client/` contains the React application, Radix-backed primitives, screens, query client, and Ky API client.
- `src/server/routes/` declares the Hono routes and request validators.
- `src/server/repositories/` implements persistence with Drizzle query builders.
- `src/server/services/`, `src/server/auth/`, `src/server/ai/`, `src/server/integrations/`, `src/server/middleware/`, and `src/server/db/` isolate backend concerns.
- `src/shared/contracts/` contains cross-boundary Zod request and response contracts.
- `db/schema/drizzle-schema.js` is the canonical database schema.
- `db/migrations/` contains Drizzle Kit migration SQL and metadata.
- `infra/database/` and `infra/cloudflare/` contain Drizzle and Cloudflare Worker deployment configuration.
- `scripts/dev/`, `scripts/build/`, and `scripts/release/` contain local runtime, build, readiness, release, and verification utilities.
- `tests/api/`, `tests/ui/`, `tests/pwa/`, and `tests/fixtures/` contain regression checks and fixture assets.
- `docs/architecture/`, `docs/operations/`, and `docs/product/` group technical, runbook, release, and planning docs.

## Local Runtime

`npm run dev` starts a Vite middleware server and routes `/api/*` through the same Hono app used by the production Worker. Local D1 data is stored in `.local/dcdcom.sqlite`; local R2 objects are stored under `.local/r2/`. A fresh local database applies `db/migrations/0000_initial.sql` automatically.

Configure optional live services in `.env.local`:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5.5
EMAIL_PROVIDER_WEBHOOK=https://your-provider.example/send
SMS_PROVIDER_WEBHOOK=https://your-provider.example/send
CRM_PROVIDER_WEBHOOK=https://your-crm-adapter.example/opportunities
STORAGE_PROVIDER_WEBHOOK=https://your-storage-adapter.example/files
INTEGRATION_PROVIDER_WEBHOOK=https://your-generic-adapter.example/sync
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:4173/api/integrations/google-calendar/callback
GOOGLE_LOGIN_CLIENT_ID=your_google_sign_in_oauth_client_id
GOOGLE_LOGIN_CLIENT_SECRET=your_google_sign_in_oauth_client_secret
GOOGLE_LOGIN_REDIRECT_URI=http://127.0.0.1:4173/api/auth/google/callback
GOOGLE_OAUTH_STATE_SECRET=use_a_long_random_value
GOOGLE_TOKEN_ENCRYPTION_KEY=use_a_different_long_random_value
AUTH_SESSION_SECRET=use_a_long_random_value_for_signed_sessions
DEFAULT_ACCOUNT_ID=acct_dcdcom
```

Without an OpenAI key, deterministic extraction and work-product generation remain available. Without communication or integration provider webhooks, outbound messages and syncs are safely queued and logged instead of being reported as sent.

Production API requests should use a signed session token in `Authorization: Bearer <payload.signature>` or the `dcdcom_session` cookie when `AUTH_SESSION_SECRET` is configured. The signed payload carries the user and account id, and all API reads/writes are scoped to that account. Local development can still use trusted identity headers when no session secret is configured.

Generated and manually saved work products create server-side PDF export files in R2 and file metadata in D1. Uploads are byte-sniffed against their declared type, capped at 12 MB, and downloads are served with sandboxing, `nosniff`, and no-store cache headers.

Google Sign-In and Google Calendar use separate callback paths. For sign-in, add the exact `GOOGLE_LOGIN_REDIRECT_URI` to the OAuth client's Authorized redirect URIs. For Calendar sync, enable the Google Calendar API and add the exact `GOOGLE_REDIRECT_URI`. You may use one Google web client for both if both redirect URIs are authorized, or separate `GOOGLE_LOGIN_*` credentials for identity sign-in.

## Deployment

The Worker expects D1 as `DB`, R2 as `FILES`, and static assets as `ASSETS`. Apply Drizzle migrations to D1 before deployment. `npm run build` writes the Vite client to `dist/client` and a bundled Worker to `dist/server/index.js`. Cloudflare deployment config lives in `infra/cloudflare/wrangler.jsonc`; use `npm run deploy` after building.

## Continuous Integration

GitLab CI is configured in `.gitlab-ci.yml`. The pipeline runs Drizzle migration validation, the architecture verifier, API/UI/PWA/readiness/release checks, the production build, and the performance budget check. Build jobs publish `dist/` as a GitLab artifact.

## Progressive Web App

DCDcom Mobile Intake is installable as a Progressive Web App after it is served from an HTTPS deployment. The production build includes:

- `public/manifest.webmanifest` for app name, launch URL, display mode, shortcuts, screenshots, theme color, and icon metadata.
- `public/icons/` for Android, iOS, and maskable app icons.
- `public/sw.js` for conservative app-shell caching, offline navigation fallback, and update activation.
- A build-time service worker precache list injected by `scripts/build/build.mjs` so hashed Vite assets are available after the first successful load.

The service worker intentionally does not cache `/api/*` requests. Inquiry data, files, auth state, and other private business data remain server-backed; only the app shell and static assets are cached for launch reliability.

### Install on iPhone

1. Deploy the production build to an HTTPS URL.
2. Open the URL in Safari on the iPhone.
3. Tap Share.
4. Tap Add to Home Screen.
5. Confirm the name, then tap Add.
6. Open DCDcom Intake from the new Home Screen icon.

### Install on Android

1. Deploy the production build to an HTTPS URL.
2. Open the URL in Chrome on the Android phone.
3. Tap Install app when prompted, or open the browser menu and tap Add to Home screen.
4. Confirm the install.
5. Open DCDcom from the app icon.

Run `npm run test:pwa` to verify the source PWA files and `npm run build` to verify the generated service worker contains the current production asset list.

## Verification Coverage

The API test covers health/readiness, bootstrap, profile and settings updates, live/fallback intake extraction, external inbound intake, inquiry creation, generated and edited proposal versions, proposal review submission, estimates and line items, follow-up delivery queueing, communication history, missing requirements, site visits, checklist completion, file upload/download, integrations, CRM sync, and workflow status changes.
