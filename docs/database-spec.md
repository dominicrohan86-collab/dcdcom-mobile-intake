# DCDcom Mobile Intake Database Specification

This app is designed around a Cloudflare D1 database using SQLite-compatible SQL. The schema supports the full lifecycle from raw customer contact to extracted intake details, estimates, site visits, documents, proposals, communications, integrations, notifications, and audit history.

## Storage Binding

- Logical binding: `DB`
- File/object binding: `FILES`
- Configured in `.openai/hosting.json` as `"d1": "DB"`
- Configured in `.openai/hosting.json` as `"r2": "FILES"`
- Canonical schema source: `db/schema.ts`
- Typed model catalog: `db/models.ts`
- Materialized SQL: `db/schema.sql`
- Initial migration: `db/migrations/0001_initial.sql`
- Seed data: `db/seed.sql`

## Core Model Groups

- Workspace and identity: `accounts`, `users`, `user_preferences`
- Customer records: `companies`, `contacts`, `sites`
- Intake pipeline: `inquiries`, `inquiry_sources`, `ai_runs`, `extracted_fields`, `missing_requirements`, `ai_summaries`
- Estimating and field work: `estimates`, `estimate_lines`, `site_visits`, `checklist_items`
- Documents and proposals: `documents`, `document_versions`, `proposals`, `proposal_sections`
- Communication and files: `communications`, `communication_delivery_attempts`, `files`
- Operations: `activity_events`, `integration_connections`, `sync_events`, `notification_rules`, `audit_log`

## Relationship Summary

- One `account` owns all operational data.
- A `company` can have many `contacts`, `sites`, and `inquiries`.
- An `inquiry` can reference one company, contact, site, and owner user.
- Raw customer input is stored in `inquiry_sources`; AI output is stored in `extracted_fields`, `missing_requirements`, and `ai_summaries`.
- Estimates and proposals are versioned separately so a proposal can reference the estimate used at send time.
- Documents use `documents` plus `document_versions` to preserve generated and edited text.
- Site visits own checklist items, which lets the app track field-readiness independent of proposal status.
- Communications preserve inbound and outbound customer touchpoints; delivery attempts preserve provider queue/send/failure evidence.
- Every meaningful workflow action can be logged in `activity_events`; durable compliance changes can be mirrored into `audit_log`.

## API Surface

The Worker now routes `/api/*` before static assets:

- `GET /api/health` checks D1 availability.
- `GET /api/bootstrap` returns current user context plus inquiry queue data.
- `GET /api/inquiries?status=&search=` lists filtered inquiries.
- `POST /api/inquiries` creates a normalized company/contact/site/inquiry/source record set.
- `POST /api/ai/intake-preview` runs OpenAI structured extraction, or deterministic fallback when `OPENAI_API_KEY` is absent.
- `POST /api/intake/inbound` accepts external email, SMS, call-transcript, or web-form intake and creates an AI-extracted opportunity.
- `POST /api/inquiries/from-source` runs extraction and persists the normalized inquiry, source, fields, missing requirements, summary, AI run, and activity event.
- `POST /api/inquiries/:id/generate` creates database-backed follow-up emails, scope documents, site checklists, estimates, and proposals from inquiry context.
- `POST /api/inquiries/:id/documents` saves manually edited drafts as versioned documents.
- `GET/POST /api/inquiries/:id/communications` lists or logs customer communications.
- `POST /api/inquiries/:id/send-follow-up` saves the email draft version and queues/sends outbound provider delivery.
- `GET /api/inquiries/:id/files` lists file metadata attached to the inquiry.
- `POST /api/inquiries/:id/files` stores the file body in R2 and searchable metadata in D1.
- `GET /api/files/:id` streams an authorized file from R2.
- `PUT /api/settings` saves notification preferences to `user_preferences`.
- `GET/POST /api/integrations` lists and connects persisted integration records.
- `POST /api/inquiries/:id/sync` writes `sync_events`, activity, and audit entries for CRM/email/calendar style sync.
- `PATCH /api/inquiries/:id/status` updates workflow state with activity and audit history.
- `GET /api/readiness` reports DB/R2 binding status, schema availability, bootstrap state, identity, and OpenAI configuration.
- `GET /api/inquiries/:id` returns one inquiry with extracted fields, missing requirements, AI summaries, activity, and documents.
- `POST /api/inquiries/:id/activity` appends an activity event.

The mobile UI hydrates queue/detail data from the Worker when the local or hosted API is available, then falls back to local mock data when the Worker is unavailable.

## Table Catalog

| Table | Purpose |
| --- | --- |
| `accounts` | Tenant/workspace boundary for DCDcom operational data. |
| `users` | Internal users who own, review, estimate, and approve work. |
| `user_preferences` | Per-user defaults for views, notifications, timezone, and UI settings. |
| `companies` | Customer and property-management organizations. |
| `contacts` | People associated with customer companies and inquiries. |
| `sites` | Physical data center, office, warehouse, or mixed-use locations. |
| `inquiries` | Main work queue record created from calls, emails, texts, photos, web, or manual notes. |
| `inquiry_sources` | Raw source text and message metadata used for extraction and auditability. |
| `ai_runs` | AI/fallback execution audit trail with model, status, latency, output JSON, and error metadata. |
| `extracted_fields` | Structured AI/person-extracted fields with confidence and verification status. |
| `missing_requirements` | Open questions and missing data needed before estimate, site visit, or proposal. |
| `ai_summaries` | Generated summaries for intake, email, proposal, scope, and confidence views. |
| `estimates` | Versioned high/low estimate ranges and assumptions. |
| `estimate_lines` | Line-item cost model for labor, logistics, recycling, equipment, and contingencies. |
| `site_visits` | Scheduling and completion state for field verification visits. |
| `checklist_items` | Structured site visit checklist tasks and completion state. |
| `documents` | Draft/review/sent documents tied to an inquiry. |
| `document_versions` | Versioned document body, subject, metadata, and AI generation flag. |
| `proposals` | Proposal lifecycle and price range linked to estimates/documents. |
| `proposal_sections` | Editable proposal sections such as scope, assumptions, deliverables, and terms. |
| `communications` | Inbound and outbound customer communication records. |
| `communication_delivery_attempts` | Provider queue/send/failure attempts for outbound communication delivery. |
| `files` | Uploaded photos, floor plans, equipment lists, contracts, and attachments. |
| `activity_events` | Timeline events used by the mobile app activity feed. |
| `integration_connections` | CRM, email, calendar, storage, and other integration connection state. |
| `sync_events` | Integration sync audit trail and error reporting. |
| `notification_rules` | User/account notification rules for missing info, due dates, and workflow events. |
| `audit_log` | Durable entity-level change history for compliance and debugging. |

## Intake Lifecycle Covered

1. A call, email, text, manual note, photo/OCR result, or web form creates an `inquiry`, an `inquiry_sources` row, and an inbound `communications` row.
2. AI extraction stores the model execution in `ai_runs`, normalized data in `extracted_fields`, open questions in `missing_requirements`, and the plain-language explanation in `ai_summaries`.
3. Photos, floor plans, equipment lists, contracts, and attachments are stored in R2 under account/inquiry scoped keys, while `files` keeps searchable metadata and authorization context.
4. The app can create a follow-up email, site visit checklist, estimate, proposal, and related document versions without losing the original raw customer text. Generated artifacts are stored in `documents`, `document_versions`, `estimates`, `estimate_lines`, `site_visits`, `checklist_items`, `proposals`, and `proposal_sections` as appropriate.
5. Follow-up emails can be queued or sent through provider webhooks. Without a configured provider, the app records a queued communication and delivery-attempt reason instead of falsely marking it sent.
6. Server-side write endpoints check workspace user roles before mutation. Estimators, project managers, sales users, and admins can perform normal workflow writes; integration connection is limited to admins and project managers.
7. Every user action can be appended to `activity_events`; sensitive or compliance-relevant edits can also be mirrored into `audit_log`.

## Required Indexes

The migration includes indexes for:

- Queue filtering by account/status/priority/date.
- Owner-specific work queues.
- Company/contact/site lookup.
- Missing requirement status by inquiry.
- Extracted field lookup by inquiry and key.
- Documents by inquiry/type/status.
- Activity and communication timelines.
- Delivery attempts by communication.
- File lookup by inquiry/category.
- Audit lookup by entity.

## Deployment Notes

1. Run `npm run db:materialize` whenever `db/schema.ts` changes.
2. Run `npm run build` to copy the server API, schema, migration files, and hosting metadata into `dist/`.
3. Apply `db/migrations/0001_initial.sql` to the D1 database for first deployment.
4. Apply `db/seed.sql` only for demo/dev data.

## Local Worker Runtime

`npm run dev` uses `scripts/local-runtime.mjs` to provide Worker-compatible bindings during local development:

- `DB` maps to a local SQLite database at `.local/dcdcom.sqlite`.
- `FILES` maps to file objects under `.local/r2`.
- `OPENAI_API_KEY` and `OPENAI_MODEL` are read from the shell environment if present.
- `EMAIL_PROVIDER_WEBHOOK`, `SMS_PROVIDER_WEBHOOK`, and `COMMUNICATION_PROVIDER_WEBHOOK` are optional provider adapter URLs for outbound delivery.

`npm run test:api` exercises the same API handler against this local runtime and covers the core customer flow from inbound intake through generated proposal, document versioning, queued follow-up delivery, communication timeline readback, file upload/download, settings, integration sync, and workflow status update.

`npm run readiness` calls `/api/readiness` through the local runtime and prints blocking checks and warning-only checks. In local development, a missing `OPENAI_API_KEY` is warning-only because deterministic fallback AI remains available. In production, configure the OpenAI key before customer use.
