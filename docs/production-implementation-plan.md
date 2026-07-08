# Production Implementation Plan

## Goal

Turn DCDcom Mobile Intake from a polished proof of concept into a production-ready mobile application and operating system for data-center decommissioning intake, triage, quoting, document generation, follow-up, and workflow ownership.

The finished app should feel like a real signed-in DCDcom workspace: branded, fast, trustworthy, personalized to the current user, secure by default, observable in production, resilient to failure, and consistent across every screen.

## Current Product Snapshot

The project already has a strong foundation:

- React 19, Vite, Tailwind 4, Radix primitives, TanStack Query, React Hook Form, Zod, Ky, and Lucide on the client.
- Hono, Zod validators, Drizzle ORM, Cloudflare D1, R2-compatible file storage, secure headers, and request telemetry on the server.
- Account-scoped API reads and writes, role checks, user preferences, notifications, audit tables, file upload/download hardening, Google Calendar integration, AI intake extraction, generated documents, proposals, site visits, communications, and readiness scripts.

The production gaps are also clear:

- No real unauthenticated app state: the client assumes `/api/bootstrap` succeeds and jumps directly into the shell.
- No login, logout, session creation, password auth, Google identity sign-in, account invitation, or password reset flow.
- Personalization exists in the data model but is shallow in the UI.
- Navigation is state-only rather than URL-backed, so refresh/deep link/share behavior is limited.
- Styling is partially centralized, but the app still carries proof-of-concept textures: phone-frame desktop wrapper, placeholder defaults, inconsistent component density, `blue-*` semantic leakage for a green brand palette, and some screen-specific patterns.
- Operational readiness is mostly local-script focused; production needs deployment, monitoring, incident, analytics, and support workflows.

## Product Principles

1. Mobile-first, production-grade, not mobile-only. The app should be excellent on a phone and competent on tablet/desktop.
2. Every screen should answer: what matters now, what changed, and what should I do next?
3. The app should remember the signed-in user: their role, name, default view, assigned work, notification preferences, integrations, drafts, saved filters, recent inquiries, and workspace permissions.
4. AI should be framed as assisted workflow, not magic. It needs source visibility, confidence, citations to uploaded artifacts where possible, fallback states, and human review checkpoints.
5. Security and auditability are core product features because the app handles customer project details, files, proposals, and internal pricing.

## Target Architecture

Keep the current stack and evolve it in place.

- Client: React app with URL-backed routes, route-level layouts, query boundaries, auth context, design-system primitives, and screen-specific feature modules.
- Server: Hono API with public auth routes, protected workspace routes, role middleware, audit middleware, and typed contract validation.
- Data: D1/Drizzle for relational workspace data, R2 for files/exports, signed/encrypted cookies for sessions, and explicit auth identity tables.
- Integrations: Google identity sign-in, Google Calendar connection, CRM/email/SMS providers, provider event logs, retryable outbound queues.
- Production runtime: Cloudflare Worker, D1 migrations, R2 buckets, static asset serving, environment validation, telemetry, error reporting, and release gates.

## Data Model Upgrades

Add or expand these tables:

- `auth_identities`: maps users to providers.
  - `id`, `account_id`, `user_id`, `provider`, `provider_subject`, `email`, `email_verified`, `metadata_json`, `created_at`, `updated_at`.
  - Unique indexes on `(provider, provider_subject)` and `(account_id, provider, email)`.
- `password_credentials`: credential-login material.
  - `user_id`, `password_hash`, `password_algorithm`, `password_updated_at`, `must_reset_password`, `failed_attempt_count`, `locked_until`.
  - Use a Cloudflare-compatible password hashing strategy. Prefer Argon2id if the chosen package supports Workers; otherwise use Web Crypto PBKDF2 with high iteration count, per-user salt, and planned migration metadata.
- `sessions`: server-side session registry.
  - `id`, `user_id`, `account_id`, `token_hash`, `created_at`, `expires_at`, `rotated_at`, `revoked_at`, `ip_hash`, `user_agent_hash`.
  - Keep browser cookies HttpOnly, Secure, SameSite=Lax or Strict.
- `oauth_states`: short-lived PKCE/state records for Google login.
  - `state_hash`, `code_verifier_encrypted`, `redirect_to`, `created_at`, `expires_at`.
- `invites`: account onboarding.
  - `id`, `account_id`, `email`, `role`, `invited_by_user_id`, `token_hash`, `expires_at`, `accepted_at`, `revoked_at`.
- `user_saved_views`: personalized filters and screen state.
  - `id`, `user_id`, `screen`, `name`, `filters_json`, `sort_json`, `is_default`, `created_at`, `updated_at`.
- `user_recent_items`: personalization signal for quick access.
  - `user_id`, `entity_type`, `entity_id`, `last_viewed_at`, `metadata_json`.
- `device_push_subscriptions`: future push notifications.
  - `id`, `user_id`, `endpoint`, `keys_json`, `created_at`, `revoked_at`.

Also add these fields where useful:

- `users.last_login_at`, `users.last_seen_at`, `users.timezone`, `users.locale`, `users.avatar_url`.
- `inquiries.owner_user_id` is already present; make ownership visible everywhere and use it in queries.
- `activity_events.visibility` and `activity_events.source` for better timeline filtering.

## Authentication Scope

### Login UX

Create a real signed-out experience before the shell loads.

Screens:

- `/login`
  - DCDcom-branded mobile-first login page.
  - Email/password form.
  - "Continue with Google" button.
  - Forgot password link.
  - Clear error states for invalid credentials, locked account, expired invite, inactive account, and unknown workspace.
- `/auth/google/callback`
  - Handles redirect state, shows brief loading/error state, then routes to intended destination.
- `/forgot-password`
  - Email submission, neutral success message, rate limiting.
- `/reset-password`
  - Token validation, new password, confirm password, sign out other sessions.
- `/accept-invite`
  - Invite details, profile completion, password creation or Google binding.
- `/logout`
  - Revokes current session and returns to `/login`.

### Auth API

Add public routes outside the protected `/api/*` workspace middleware or split protected middleware by route:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/refresh`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/accept-invite`

Behavior:

- Issue HttpOnly signed/encrypted session cookie.
- Rotate session on login and refresh.
- Revoke sessions on logout, password reset, user deactivation, and role removal.
- Enforce rate limits on login, forgot password, reset password, and invite acceptance.
- Log auth events to `audit_log`.
- Return a normalized current-user payload:
  - `id`, `email`, `fullName`, `role`, `avatarUrl`, `accountId`, `accountName`, `permissions`, `preferences`, `integrations`, `featureFlags`.

### Google Sign-In

Separate Google identity sign-in from Google Calendar integration.

- Use Google OAuth/OIDC scopes for identity: `openid email profile`.
- Store identity in `auth_identities`.
- Match existing users by verified email within an account.
- If email is not invited or not part of an account, show an access-request state rather than auto-provisioning into production data.
- After login, optionally prompt users to connect Google Calendar as a second, explicit integration.

## Personalization Scope

Personalization should begin immediately after login.

### App Shell

- Replace placeholder profile icon with avatar or initials.
- Header greeting should adapt by screen and time: "Good morning, Alex" on Today; compact account switch/profile affordance elsewhere.
- Show the user's role and workspace in the More/Profile area.
- Default screen comes from `user_preferences.default_view`.
- Last selected inquiry, recent docs, and active draft states persist per user, not globally in localStorage.
- Add profile menu with Account, Preferences, Integrations, Security, Help, and Sign out.

### Today

Upgrade Today from a generic schedule into a personal command center:

- "My Focus" queue: assigned urgent inquiries, stale follow-ups, pending reviews, site visits, and high-value proposals.
- "For Me" filter based on `owner_user_id`, mentions, reviews, and notifications.
- Calendar section with quiet connected state and actionable disconnected/error state.
- Suggested blocks based on workload, due dates, and calendar availability.
- Quick actions: capture inquiry, scan/upload doc, draft follow-up, review proposal.

### Inquiries

- Saved filters per user: My open, Needs info, Proposals due, Site visits, Recently viewed, All.
- Owner chips and assignment controls for admin/project manager roles.
- Sort by urgency, received date, due date, value, status, or last activity.
- Empty states should be operational: "No assigned proposals due today" rather than generic empty copy.

### Add Inquiry

- Personal defaults: user's preferred source channel, region/timezone, default owner.
- Drafts are per user and per workspace.
- Camera-first capture for photos on mobile.
- Intake confirmation screen should show extracted company/contact/site/source evidence before save.
- Add "Save as draft" and "Submit to queue" distinction.

### Inquiry Detail

- Show owner, collaborators, last activity, and user-specific next step.
- Timeline should clearly separate AI activity, human edits, customer communication, file uploads, and status changes.
- Add assign/reassign, watch/unwatch, mention/comment, and internal note flows.
- Make status transitions explicit with validation guidance and reason capture for lost/archived.

### Docs

- Personalized recent docs and documents needing the user's review.
- Better preview states for generated work, PDFs, photos, spreadsheets, and unsupported files.
- Add document version comparison, review comments, approval status, and export history.
- Generated documents should carry source file references and generation metadata.

### Composers

- Turn email/proposal builders into production editors:
  - autosave per user and document;
  - version history;
  - preview before send;
  - recipient validation;
  - approval workflow for proposals;
  - send/queue status with provider attempt details.
- AI generation should show selected sources, missing inputs, fallback mode, confidence, and last generated time.

### More/Profile

- Account profile: name, email, avatar, role, timezone.
- Preferences: default view, notification digest, saved filters, theme, calendar display.
- Security: password change, Google identity binding, active sessions, sign out everywhere.
- Integrations: Google Calendar, CRM, email, SMS, storage, with connection owner and last sync.
- Admin-only area: users, invites, roles, account settings, audit log.

## Design System Upgrade

### Brand Direction

Create one cohesive DCDcom palette and component language.

Recommended palette:

- Primary: DCDcom green.
  - `brand-50 #f3f8ef`
  - `brand-100 #e5f1dc`
  - `brand-300 #b7e6a8`
  - `brand-500 #7fc242`
  - `brand-600 #5c9826`
  - `brand-700 #477a1d`
  - `brand-900 #2e4e1a`
- Neutral: industrial charcoal and clean grays.
  - `neutral-50 #fafafa`
  - `neutral-100 #efefef`
  - `neutral-200 #dededb`
  - `neutral-500 #666a6d`
  - `neutral-700 #383b3e`
  - `neutral-900 #191919`
  - `neutral-950 #101010`
- Accent colors:
  - Success green distinct from brand: `emerald`.
  - Warning: amber.
  - Danger: red.
  - Information: steel/cyan sparingly.

Implementation:

- Rename semantic Tailwind usage from `blue-*` to `brand-*` in components and screens.
- Keep status colors semantic: `success`, `warning`, `danger`, `info`, `neutral`.
- Define tokens for radius, shadow, spacing, touch targets, page background, surface, border, muted text, and focus ring.
- Remove the desktop phone-frame as the default production wrapper. Use a real responsive layout:
  - phone: bottom tab bar;
  - tablet: bottom or side nav depending width;
  - desktop: left rail plus constrained content panes.
- Maintain 44px minimum touch targets.
- Use Lucide icons consistently for actions.
- Avoid explanatory UI text that describes features; use direct workflow labels and useful empty states.

### Component Inventory

Create or harden shared components:

- `AppLayout`, `AuthLayout`, `BottomNav`, `SideNav`, `TopBar`, `ProfileMenu`.
- `PageHeader`, `SectionHeader`, `CommandBar`.
- `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Tabs`, `SegmentedControl`.
- `Badge`, `StatusChip`, `PriorityIndicator`, `OwnerAvatar`, `UserAvatar`.
- `Card` only for repeated items, dialogs, and framed tools.
- `ListRow`, `EmptyState`, `Skeleton`, `InlineNotice`, `Toast`.
- `Dialog`, `Drawer`, `Popover`, `ActionSheet`.
- `FilePreview`, `DocumentPreview`, `ActivityTimeline`, `WorkflowStepper`.

## Navigation And App Structure

Move from state-only navigation to URL-backed routes.

Proposed routes:

- `/login`
- `/today`
- `/inquiries`
- `/inquiries/new`
- `/inquiries/:id`
- `/inquiries/:id/follow-up`
- `/inquiries/:id/documents`
- `/inquiries/:id/proposal`
- `/docs`
- `/notifications`
- `/profile`
- `/settings`
- `/admin/users`
- `/admin/audit`

Implementation options:

- Add React Router or a lightweight URL router.
- Keep TanStack Query for server state.
- Add route guards:
  - signed-out users go to `/login`;
  - signed-in users cannot visit `/login` unless they sign out;
  - role-restricted screens show permission state.
- Persist intended destination through login.
- Add deep links from notifications and emails.

## Backend Production Hardening

### API Contracts

- Keep Zod contracts as the public API boundary.
- Add auth contract schemas.
- Standardize response shapes:
  - success: `{ data, meta }` for list/detail APIs;
  - error: `{ error, code, detail, requestId }`.
- Add request IDs to every response.
- Normalize pagination for list endpoints.
- Add optimistic concurrency for critical edits with `updated_at` or version numbers.

### Permissions

Define explicit permission map instead of role-only checks:

- `inquiry:create`, `inquiry:update`, `inquiry:delete`, `inquiry:assign`.
- `document:generate`, `document:approve`, `document:send`.
- `integration:manage`.
- `user:invite`, `user:update_role`, `audit:read`.

Roles map to permissions:

- Admin: all.
- Project manager: workflow, assignment, review, integrations where delegated.
- Sales/estimator: intake, estimates, documents, communications.
- Viewer: read-only.

### Jobs And Queues

Production workflows need retryable background work:

- Outbound email/SMS send attempts.
- CRM sync.
- Calendar sync refresh.
- AI generation if request exceeds client wait time.
- File processing and future OCR.
- Notification digests.

Implement using Cloudflare Queues or a scheduled Worker depending deployment constraints.

### Files

- Add antivirus/malware scanning strategy if compliance requires it.
- Generate thumbnails for images and PDFs.
- Store file hash for dedupe and integrity.
- Add signed, short-lived download URLs for external sharing instead of direct authenticated file URLs.
- Add file retention/deletion policies.

### AI

- Add AI prompt/version registry.
- Store source document IDs, model, provider, latency, fallback status, and generation parameters.
- Add user-visible source list for generated outputs.
- Add redaction guardrails for sensitive fields if documents are sent to providers.
- Add per-account AI usage limits and admin visibility.

## Production Operations

### Environments

Define three environments:

- Local: `.local` D1/R2 adapters and trusted dev headers when no session secret exists.
- Staging: real auth, staging D1, staging R2, test OAuth client, test provider webhooks.
- Production: real auth, production D1/R2, production OAuth client, provider webhooks, alerting.

### Required Secrets

- `AUTH_SESSION_SECRET`
- `AUTH_COOKIE_NAME`
- `GOOGLE_LOGIN_CLIENT_ID`
- `GOOGLE_LOGIN_CLIENT_SECRET`
- `GOOGLE_LOGIN_REDIRECT_URI`
- `GOOGLE_OAUTH_STATE_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `PASSWORD_RESET_SECRET`
- provider webhook/API secrets
- `OPENAI_API_KEY`
- telemetry/error-reporting keys

### Observability

- Request IDs, structured logs, user/account context, and route-level latency.
- Error reporting with redaction.
- Metrics:
  - login success/failure;
  - API error rate;
  - AI generation latency/failure/fallback;
  - file upload/download failures;
  - CRM/email/calendar sync failures;
  - proposal review cycle time;
  - intake-to-proposal conversion.
- Admin health page backed by readiness data.

### Security

- HttpOnly Secure session cookies.
- CSRF protection for cookie-authenticated mutations.
- Rate limits on auth and high-cost AI endpoints.
- Strict upload validation remains in place.
- Content Security Policy for app and file previews.
- Audit log for auth, role, inquiry deletion, proposal approval, outbound sends, integration changes.
- Session revocation and inactive-user enforcement.
- Principle-of-least-privilege environment access.

## Testing And Quality Gates

Add layers beyond current source checks:

- Unit tests for auth token/session utilities, permission mapping, status transitions, and parsing helpers.
- API tests for:
  - credential login;
  - Google login callback happy path and failure path;
  - logout/session revocation;
  - invite acceptance;
  - password reset;
  - unauthorized/forbidden protected routes;
  - account scoping;
  - role permissions;
  - file access isolation.
- Component tests for login, shell, profile, settings, inquiry list, document builder, notification panel.
- Playwright mobile E2E:
  - login with password;
  - login with mocked Google callback;
  - personalized Today loads;
  - create inquiry;
  - upload file;
  - generate document;
  - send follow-up;
  - logout.
- Visual regression screenshots for core mobile and desktop routes.
- Accessibility checks:
  - keyboard navigation;
  - focus states;
  - screen-reader labels;
  - contrast;
  - reduced motion.
- Production build gate:
  - migration check;
  - API tests;
  - UI source tests;
  - Playwright smoke;
  - readiness;
  - bundle build.

## Implementation Phases

### Phase 1: Auth Foundation

Deliverables:

- Add auth database tables and migrations.
- Add session issuance, verification, refresh, revoke, and logout.
- Add password credential login with lockout/rate-limit policy.
- Add Google identity sign-in with OIDC state/PKCE.
- Add `/api/auth/session` and client auth context.
- Split public auth routes from protected workspace middleware.
- Add login, forgot password, reset password, invite acceptance, and logout screens.
- Add basic security audit events.

Definition of done:

- Signed-out users see `/login`.
- Email/password login works.
- Google sign-in works in staging configuration.
- Logout revokes the session.
- Protected APIs return consistent `401` when unauthenticated.
- Existing app loads after login with current user data.

### Phase 2: Design System And Navigation

Deliverables:

- Introduce semantic brand tokens and remove screen-level palette drift.
- Rename component variants from `blue` semantics to `brand`.
- Add responsive production layout and remove the default phone-frame wrapper.
- Introduce URL-backed routing and protected route guards.
- Build AuthLayout, AppLayout, TopBar, BottomNav, SideNav, ProfileMenu, Toast, Skeleton, and EmptyState upgrades.
- Polish loading, error, empty, offline, and permission states.

Definition of done:

- Every screen shares the same palette, typography, radius, focus, and spacing rules.
- Refreshing a route preserves the screen.
- Deep links from notifications open the right inquiry/document/workflow.
- Mobile and desktop screenshots look production-ready.

### Phase 3: Personal Workspace

Deliverables:

- Personalized Today command center.
- User avatar/initials, profile menu, preferences, security, and sign-out.
- Saved filters and default views.
- My work / assigned work filtering.
- Recent items and user-specific drafts.
- Notification preference UI backed by user preferences/rules.
- Owner assignment controls based on permissions.

Definition of done:

- Two users in the same account can see different default views, recent items, drafts, notification counts, saved filters, and assigned-work queues.
- Role restrictions are visible and enforced both client-side and server-side.

### Phase 4: Workflow Polish

Deliverables:

- Add inquiry detail timeline, comments/internal notes, assignment, watch/unwatch, and stronger status transition UX.
- Upgrade Add Inquiry with review-before-save, camera-first capture, per-user draft handling, and clearer source evidence.
- Upgrade Docs with review queue, version history, export history, source references, and better previews.
- Upgrade Email and Proposal composers with autosave, preview, approval, send queue status, source visibility, and version comparison.
- Improve AI generation transparency with sources, prompt version, fallback state, and readiness indicators.

Definition of done:

- Every primary workflow can be started, paused, resumed, reviewed, and audited.
- Users understand what AI used, what it produced, and what needs human review.

### Phase 5: Operations And Integrations

Deliverables:

- Retryable outbound queue for email/SMS/CRM/calendar sync.
- Provider attempt logs and admin-visible integration health.
- Environment validation and staging/production deployment checklist.
- Structured telemetry, error reporting, and production alerts.
- File thumbnailing, signed external share links, and retention controls.
- Admin users/invites/roles/audit screens.

Definition of done:

- Production support can answer: who did what, what failed, what is queued, and what needs attention.
- Provider failures are visible, retryable, and do not silently corrupt workflow state.

### Phase 6: Release Hardening

Deliverables:

- Full API, UI, E2E, accessibility, and visual regression suite.
- Migration rollback notes and seeded staging data.
- Performance budget for mobile.
- Security review checklist.
- Incident runbook.
- Launch checklist and post-launch monitoring dashboard.

Definition of done:

- A release candidate can be deployed to staging, verified end to end, promoted to production, and monitored without manual guesswork.

## Priority Backlog

P0:

- Real login/logout/session system.
- Google sign-in.
- Protected client auth boundary.
- Production layout and unified design tokens.
- URL routes.
- Account/user-aware personalization.
- Auth and permission tests.

P1:

- Saved filters, recent items, user-specific drafts.
- Profile/preferences/security screens.
- Admin invites and role management.
- Improved Today command center.
- Document autosave/version review.
- Provider queue and retry visibility.

P2:

- Comments/mentions/watchers.
- External share links.
- File thumbnails.
- Push notifications.
- Advanced analytics dashboard.
- AI source citations and prompt registry UI.

## Suggested First Sprint

1. Add auth schema and migrations.
2. Implement `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`.
3. Add LoginScreen and AuthProvider.
4. Make `/api/bootstrap` return `401` cleanly when unauthenticated.
5. Route signed-out users to `/login`.
6. Add user avatar/profile menu with Sign out.
7. Replace phone-frame wrapper with production responsive shell.
8. Rename palette semantics from `blue` to `brand` in the shared component layer.
9. Add auth API tests and a password-login Playwright smoke test.

## Final Production Acceptance Criteria

The app is production-ready when:

- Users can sign in with email/password or Google, sign out, reset passwords, accept invites, and manage active sessions.
- Every API request is authenticated, account-scoped, permission-checked, observable, and audited where appropriate.
- The app is personalized by signed-in user across default view, profile, notifications, assignments, recent work, drafts, saved filters, and integrations.
- Every screen uses one cohesive DCDcom visual system.
- Core workflows pass on mobile: login, capture inquiry, upload files, review extraction, follow up, generate proposal, submit review, inspect docs, receive notifications, and logout.
- Staging and production have clear environment configuration, migrations, health checks, logs, alerts, and release gates.
- The UI no longer feels like localhost: no fake defaults, no demo shell chrome, no unexplained placeholders, no one-off styling, and no dead-end states.
