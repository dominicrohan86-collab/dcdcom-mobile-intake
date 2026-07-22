# Release Checklist

## Before Staging

- `npm run verify` passes locally.
- Database migrations and runtime `ensureDatabase` paths include new tables/columns.
- New API routes have contract validation and API smoke coverage.
- Mobile source regression covers visible workflow/UI changes.
- Readiness still reports D1, R2, auth mode, OpenAI, and Google Calendar state.

## Staging Verification

- Login with password and Google identity.
- Open personalized Today and Inquiries routes by URL refresh.
- Create an inquiry, upload source files, generate a proposal, and submit review.
- Confirm generated document shows source references and prompt version.
- Create and revoke a signed external file link.
- Preview file retention cleanup without deleting files.
- Check System health, Provider queue, Audit history, and AI prompt registry.

## Production Promotion

- Confirm production secrets: `AUTH_SESSION_SECRET`, Google login OAuth, Google Calendar OAuth, OpenAI key, provider webhooks, telemetry keys.
- Apply D1 migrations before routing traffic to the new Worker.
- Confirm R2 bucket bindings and retention policy.
- Watch structured logs for 30 minutes after release.
- Keep rollback artifact and previous Worker version available.

## Post-Launch

- Review login failures, API error rate, AI fallback rate, file upload/download failures, provider queue failures, and proposal review cycle time.
- Verify no unexpected audit-log spikes for auth, role, deletion, file share, retention, or outbound-send actions.
