# DCDcom Mobile Intake

A mobile-first prototype for DCDcom.com that turns customer calls, emails, texts, or manual notes into a structured decommissioning opportunity.

## What It Includes

- Today and pipeline queues modeled after the supplied mobile references.
- Add Inquiry flow with call note, email, manual, and photo/OCR input modes.
- Mock AI extraction preview with confidence, captured fields, and missing information.
- Review detail screen with AI summary, missing details, extracted contact data, and next actions.
- Follow-up email generator with tone controls, include toggles, editable draft, regenerate, copy, and save behavior.
- Proposal draft with tabs, approval state, confidence score, and review workflow.
- A production-style Cloudflare D1 database layer with schema, typed models, seed data, migrations, and `/api/*` routes.
- OpenAI-backed structured intake extraction with deterministic fallback when no API key is configured.
- AI-generated follow-up emails, scopes of work, site visit checklists, estimates, and proposal drafts persisted as database records.
- Generated and manually edited document bodies are versioned in D1, so drafts survive reloads and keep revision history.
- R2-backed uploads for photos, floor plans, equipment lists, and customer attachments, with D1 metadata.
- Workspace-authenticated, role-aware write APIs with audit logging for workflow, settings, and integration changes.

## Project Structure

- `public/` contains the static HTML entry, stylesheet, and tiny browser bootstrap.
- `src/state/` contains app state and mock DCDcom opportunity data.
- `src/lib/` contains reusable extraction, draft, and icon utilities.
- `src/ui/components.js` contains shared UI primitives.
- `src/ui/screens/` contains one module per mobile screen.
- `src/server/` contains the Sites worker API, database bootstrap, and repository functions.
- `src/server/ai.js` contains the OpenAI Responses API integration and fallback extractor.
- `src/server/auth.js` and `src/server/validation.js` contain server-side authorization and request validation helpers.
- `db/` contains the canonical database schema, typed models, materialized SQL, seed data, and migrations.
- `docs/database-spec.md` contains the database architecture and deployment notes.
- `scripts/` contains the local development server and Sites-compatible build script.

## Commands

```bash
npm run dev
npm run db:materialize
npm run test:api
npm run readiness
npm run build
npm run verify
```

`npm run dev` serves the mobile app and routes `/api/*` through the same Worker handler used in production. For local development it creates a SQLite-backed D1 emulator and filesystem-backed R2 emulator under `.local/`, so intake, AI fallback generation, uploads, settings, integrations, and sync flows can be exercised without provisioning cloud resources first.

## Database Layer

The app is configured for a Cloudflare D1 binding named `DB` and an R2 binding named `FILES` in `.openai/hosting.json`. The source of truth is `db/schema.ts`; `npm run db:materialize` generates `db/schema.sql`, `db/migrations/0001_initial.sql`, and `src/server/schema.js`.

The initial database covers accounts, users, companies, contacts, sites, inquiries, raw intake sources, AI runs, AI extracted fields, missing requirements, summaries, estimates, site visits, checklists, documents, proposals, communications, files, integrations, notifications, activity events, and audit logs.

## AI Configuration

Set these runtime environment variables for live AI extraction:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.5
```

When `OPENAI_API_KEY` is missing, the app still works with a deterministic fallback extractor and records the fallback in `ai_runs`.

AI/API endpoints:

- `POST /api/ai/intake-preview` analyzes pasted customer communication and returns structured preview rows.
- `POST /api/inquiries/from-source` analyzes the raw source, persists normalized records to D1, and returns the saved inquiry id.
- `POST /api/inquiries/:id/generate` generates and persists downstream work products such as follow-up emails, proposals, scopes, estimates, and site checklists.
- `POST /api/inquiries/:id/documents` saves edited drafts as durable document versions.
- `GET /api/inquiries/:id/files` lists linked photos, plans, equipment lists, and attachments.
- `POST /api/inquiries/:id/files` stores bytes in R2 and metadata in D1.
- `GET /api/files/:id` returns an authorized file download.
- `PUT /api/settings` saves notification preferences.
- `POST /api/integrations` connects CRM/email/calendar/storage integration placeholders.
- `POST /api/inquiries/:id/sync` writes a durable sync event and activity timeline entry.
- `PATCH /api/inquiries/:id/status` updates workflow status with audit history.
- `GET /api/readiness` checks D1/R2 bindings, schema, account bootstrap, user identity, and OpenAI configuration.

The build output is written to `dist/` with `dist/server/index.js`, `dist/client/**`, and `dist/.openai/hosting.json` for Sites hosting.

## Local Verification

`npm run test:api` runs an end-to-end smoke test against the local Worker environment. It verifies bootstrap, AI intake fallback, inquiry creation, proposal generation and readback, edited document versioning, file upload/download, settings, integration connection, CRM sync, and workflow status updates.

`npm run readiness` prints a readiness report using the local Worker environment. Missing `OPENAI_API_KEY` is treated as a warning because fallback AI remains available locally; production should configure it before customer use.

## Production Readiness

Before a customer deployment, verify:

- `.openai/hosting.json` has `d1: "DB"` and `r2: "FILES"`.
- D1 has `db/migrations/0001_initial.sql` applied.
- R2 storage is provisioned for the `FILES` binding.
- `OPENAI_API_KEY` and `OPENAI_MODEL` are configured in the hosted runtime.
- `npm run verify` and `npm run build` pass.
- `/api/readiness` returns no blocking failures in the deployed environment.

API JSON responses include security headers, no-store caching, and request IDs. File downloads are account/inquiry authorized and served with conservative content headers.
