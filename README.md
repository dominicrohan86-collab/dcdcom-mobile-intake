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
npm run db:generate  # Generate a migration after changing db/drizzle-schema.js
npm run db:check     # Validate Drizzle migrations
npm run test:api     # End-to-end API workflow tests
npm run readiness    # D1, R2, identity, account, and AI readiness
npm run build        # Production client and Worker bundles
npm run verify       # Architecture, API, readiness, and production build gates
```

## Project Structure

- `src/client/` contains the React application, Radix-backed primitives, screens, query client, and Ky API client.
- `src/server/app.js` declares the Hono routes and Zod validators.
- `src/server/repository.js` implements all persistence with Drizzle query builders.
- `db/drizzle-schema.js` is the canonical database schema.
- `db/migrations/` contains Drizzle Kit migration SQL and metadata.
- `scripts/local-runtime.mjs` provides local D1 and R2-compatible bindings.
- `scripts/test-api.mjs` exercises the complete inquiry lifecycle through Hono.
- `docs/stack.md` records package choices and the migration boundary.

## Local Runtime

`npm run dev` starts a Vite middleware server and routes `/api/*` through the same Hono app used by the production Worker. Local D1 data is stored in `.local/dcdcom.sqlite`; local R2 objects are stored under `.local/r2/`. A fresh local database applies `db/migrations/0000_initial.sql` automatically.

Configure optional live services in `.env.local`:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5.5
EMAIL_PROVIDER_WEBHOOK=https://your-provider.example/send
SMS_PROVIDER_WEBHOOK=https://your-provider.example/send
```

Without an OpenAI key, deterministic extraction and work-product generation remain available. Without communication provider webhooks, outbound messages are safely queued and logged instead of being reported as sent.

## Deployment

The Worker expects D1 as `DB`, R2 as `FILES`, and static assets as `ASSETS`. Apply Drizzle migrations to D1 before deployment. `npm run build` writes the Vite client to `dist/client`, a bundled Worker to `dist/server/index.js`, and hosting/database metadata under `dist/.openai`.

## Verification Coverage

The API test covers health/readiness, bootstrap, profile and settings updates, live/fallback intake extraction, external inbound intake, inquiry creation, generated and edited proposal versions, proposal review submission, estimates and line items, follow-up delivery queueing, communication history, missing requirements, site visits, checklist completion, file upload/download, integrations, CRM sync, and workflow status changes.
