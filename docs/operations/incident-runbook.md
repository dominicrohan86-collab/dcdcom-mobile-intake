# Incident Runbook

## Severity Levels

- SEV1: Authentication, data isolation, file access, or proposal workflow is unavailable for most users.
- SEV2: A core workflow is degraded, including AI generation, uploads/downloads, notifications, or provider sync.
- SEV3: Non-blocking UI, reporting, or admin-health issue with a workaround.

## First 15 Minutes

1. Confirm scope from `/api/readiness`, request logs, admin System health, and Provider queue.
2. Assign an incident lead, customer communicator, and scribe.
3. Freeze deploys unless the active release is the suspected cause.
4. Capture affected account IDs, user IDs, inquiry IDs, request IDs, and exact timestamps.
5. Decide mitigation: rollback, disable provider integration, enable local AI fallback, legal hold file cleanup, or pause outbound sends.

## Checks

- Auth: login success/failure rate, session secret presence, locked users, revoked sessions.
- Data: D1 readiness, migration version, account scoping errors, recent audit log entries.
- Files: R2 availability, signed share-link errors, retention legal hold, upload rejection rate.
- AI: prompt version, model, fallback rate, latency, timeout errors, source-document selection.
- Providers: delivery attempts, CRM/calendar sync queue, webhook errors, retry backlog.

## Communications

- Internal update every 30 minutes for SEV1 and hourly for SEV2.
- Customer-facing notes should avoid exposing internals; state impacted workflow, workaround, and next update time.
- Post-incident review due within two business days for SEV1/SEV2.

## Recovery

1. Verify readiness is `ready`.
2. Run `npm run verify`.
3. Confirm one happy-path workflow in staging: login, create inquiry, upload file, generate proposal, queue follow-up.
4. Review audit logs and provider queue for stuck or duplicate work.
5. Close with timeline, root cause, customer impact, and follow-up tasks.
