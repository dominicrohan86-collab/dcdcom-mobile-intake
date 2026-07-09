import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../src/server/app.js";
import { handleApi } from "../src/server/api.js";
import { describeGoogleCalendarFailure } from "../src/server/google-calendar.js";
import { createLocalEnv } from "./local-runtime.mjs";

const root = await mkdtemp(join(tmpdir(), "dcdcom-api-"));

try {
  const env = await createLocalEnv({ root });
  const secureEnv = { ...env, AUTH_SESSION_SECRET: "test-auth-secret" };
  const unauthenticated = await request(secureEnv, "GET", "/api/bootstrap");
  assert(unauthenticated.status === 401, "signed auth mode should reject missing session tokens");
  const signedPrimaryHeaders = await authHeaders(secureEnv.AUTH_SESSION_SECRET, { email: "alex@dcdcom.com", fullName: "Alex Production", accountId: "acct_dcdcom" });
  const signedBootstrap = await request(secureEnv, "GET", "/api/bootstrap", undefined, { headers: signedPrimaryHeaders });
  assert(signedBootstrap.status === 200 && signedBootstrap.body.accountId === "acct_dcdcom", "signed auth should resolve the token account");
  const signedTenantHeaders = await authHeaders(secureEnv.AUTH_SESSION_SECRET, { email: "tenant@dcdcom.com", fullName: "Tenant User", accountId: "acct_second" });
  const tenantBootstrap = await request(secureEnv, "GET", "/api/bootstrap", undefined, { headers: signedTenantHeaders });
  assert(tenantBootstrap.status === 200 && tenantBootstrap.body.accountId === "acct_second", "signed auth should bootstrap a second tenant");
  assert(tenantBootstrap.body.inquiries.every((inquiry) => inquiry.id !== "inq_ntt_ashburn"), "second tenant should not reuse primary tenant seed ids");
  const crossTenantDetail = await request(secureEnv, "GET", "/api/inquiries/inq_ntt_ashburn", undefined, { headers: signedTenantHeaders });
  assert(crossTenantDetail.status === 404, "second tenant should not read primary tenant inquiries");
  const login = await request(secureEnv, "POST", "/api/auth/login", { email: "alex@dcdcom.com", password: "Dcdcom2026!" });
  assert(login.status === 200, "password login should return 200");
  assert(login.headers.get("x-request-id"), "auth responses should include request ids");
  assert(login.body.user.email === "alex@dcdcom.com", "password login should return the signed-in user");
  assert(login.body.user.permissions.includes("inquiries:write"), "password login should include role permissions");
  const sessionCookie = login.headers.get("set-cookie");
  assert(sessionCookie?.includes("dcdcom_session="), "password login should issue a session cookie");
  const cookieHeader = sessionCookie.split(";")[0];
  const session = await request(secureEnv, "GET", "/api/auth/session", undefined, { headers: { cookie: cookieHeader } });
  assert(session.status === 200 && session.body.authenticated === true, "session endpoint should read the signed session cookie");
  const protectedBootstrap = await request(secureEnv, "GET", "/api/bootstrap", undefined, { headers: { cookie: cookieHeader } });
  assert(protectedBootstrap.status === 200 && protectedBootstrap.body.user.email === "alex@dcdcom.com", "protected APIs should accept the signed session cookie");
  const blockedCsrf = await request(secureEnv, "PATCH", "/api/profile", { fullName: "Cross Site" }, { headers: { cookie: cookieHeader, origin: "https://evil.example" } });
  assert(blockedCsrf.status === 403 && blockedCsrf.body.code === "csrf_origin_mismatch", "cookie-authenticated mutations should reject cross-site origins");
  const logout = await request(secureEnv, "POST", "/api/auth/logout", undefined, { headers: { cookie: cookieHeader } });
  assert(logout.status === 200, "logout should return 200");
  const revokedBootstrap = await request(secureEnv, "GET", "/api/bootstrap", undefined, { headers: { cookie: cookieHeader } });
  assert(revokedBootstrap.status === 401, "logout should revoke the signed session");
  const lifecycleEnv = { ...secureEnv, EXPOSE_AUTH_LINKS: "true" };
  const resetRequest = await request(lifecycleEnv, "POST", "/api/auth/forgot-password", { email: "alex@dcdcom.com" });
  assert(resetRequest.status === 200 && resetRequest.body.resetUrl, "forgot password should create a usable reset link in local/test mode");
  const resetToken = new URL(resetRequest.body.resetUrl).searchParams.get("token");
  const resetPassword = await request(lifecycleEnv, "POST", "/api/auth/reset-password", { token: resetToken, password: "DcdcomReset2026!" });
  assert(resetPassword.status === 200 && resetPassword.headers.get("set-cookie")?.includes("dcdcom_session="), "password reset should update password and sign in");
  const resetCookie = resetPassword.headers.get("set-cookie").split(";")[0];
  const resetSession = await request(lifecycleEnv, "GET", "/api/auth/session", undefined, { headers: { cookie: resetCookie } });
  assert(resetSession.status === 200 && resetSession.body.user.email === "alex@dcdcom.com", "password reset session should be readable");
  const sessionList = await request(lifecycleEnv, "GET", "/api/security/sessions", undefined, { headers: { cookie: resetCookie } });
  assert(sessionList.status === 200 && sessionList.body.sessions.length >= 1, "security sessions should list active user sessions");
  const changedPassword = await request(lifecycleEnv, "POST", "/api/security/password", { currentPassword: "DcdcomReset2026!", newPassword: "DcdcomFinal2026!" }, { headers: { cookie: resetCookie } });
  assert(changedPassword.status === 200, "change password should accept the current password");
  const revokedAfterPasswordChange = await request(lifecycleEnv, "GET", "/api/bootstrap", undefined, { headers: { cookie: resetCookie } });
  assert(revokedAfterPasswordChange.status === 401, "change password should revoke existing sessions");
  const reloginAfterChange = await request(lifecycleEnv, "POST", "/api/auth/login", { email: "alex@dcdcom.com", password: "DcdcomFinal2026!" });
  assert(reloginAfterChange.status === 200, "changed password should work for the next login");
  const invite = await request(lifecycleEnv, "POST", "/api/admin/invites", { email: "new.estimator@dcdcom.com", role: "estimator" }, { headers: signedPrimaryHeaders });
  assert(invite.status === 201 && invite.body.invite.inviteUrl, "admin should create a usable invite link in local/test mode");
  const inviteToken = new URL(invite.body.invite.inviteUrl).searchParams.get("token");
  const acceptedInvite = await request(lifecycleEnv, "POST", "/api/auth/accept-invite", { token: inviteToken, fullName: "New Estimator", password: "Estimator2026!" });
  assert(acceptedInvite.status === 200 && acceptedInvite.body.user.email === "new.estimator@dcdcom.com", "invite acceptance should create and sign in the user");
  const invitedLogin = await request(lifecycleEnv, "POST", "/api/auth/login", { email: "new.estimator@dcdcom.com", password: "Estimator2026!" });
  assert(invitedLogin.status === 200, "invited user should be able to login with created password");
  const adminUsers = await request(lifecycleEnv, "GET", "/api/admin/users", undefined, { headers: signedPrimaryHeaders });
  const invitedUser = adminUsers.body.users.find((item) => item.email === "new.estimator@dcdcom.com");
  assert(adminUsers.status === 200 && invitedUser, "admin user listing should include invited users");
  const deactivatedUser = await request(lifecycleEnv, "PATCH", `/api/admin/users/${invitedUser.id}`, { isActive: false }, { headers: signedPrimaryHeaders });
  assert(deactivatedUser.status === 200 && deactivatedUser.body.user.id === invitedUser.id, "admin should deactivate users");
  const deactivatedLogin = await request(lifecycleEnv, "POST", "/api/auth/login", { email: "new.estimator@dcdcom.com", password: "Estimator2026!" });
  assert(deactivatedLogin.status === 403, "deactivated users should not be able to login");
  const signup = await request(lifecycleEnv, "POST", "/api/auth/signup", { fullName: "Self Service User", email: "self.service@dcdcom.com", password: "SelfService2026!" });
  assert(signup.status === 201 && signup.headers.get("set-cookie")?.includes("dcdcom_session="), "self-service signup should create a signed session");
  assert(signup.body.user.email === "self.service@dcdcom.com" && signup.body.user.fullName === "Self Service User" && signup.body.user.permissions.includes("inquiries:write"), "self-service signup should return the personalized user name and email");
  const signupCookie = signup.headers.get("set-cookie").split(";")[0];
  const signupBootstrap = await request(lifecycleEnv, "GET", "/api/bootstrap", undefined, { headers: { cookie: signupCookie } });
  assert(signupBootstrap.status === 200 && signupBootstrap.body.user.email === "self.service@dcdcom.com" && signupBootstrap.body.user.fullName === "Self Service User", "signed-up users should load their own personalized workspace");
  const duplicateSignup = await request(lifecycleEnv, "POST", "/api/auth/signup", { fullName: "Duplicate", email: "self.service@dcdcom.com", password: "SelfService2026!" });
  assert(duplicateSignup.status === 409, "self-service signup should reject duplicate emails");
  const localModeSignup = await request(env, "POST", "/api/auth/signup", { fullName: "Local Created User", email: "local.created@dcdcom.com", password: "LocalCreated2026!" });
  assert(localModeSignup.status === 201, "local-mode signup should create a signed session");
  const localModeCookie = localModeSignup.headers.get("set-cookie").split(";")[0];
  const localModeBootstrap = await request(env, "GET", "/api/bootstrap", undefined, { headers: { cookie: localModeCookie, "oai-authenticated-user-email": "alex@dcdcom.com" } });
  assert(localModeBootstrap.status === 200 && localModeBootstrap.body.user.email === "local.created@dcdcom.com" && localModeBootstrap.body.user.fullName === "Local Created User", "local-mode bootstrap should prefer the signed-up user session over the default dev identity");
  const googleLoginStart = await request({ ...lifecycleEnv, GOOGLE_LOGIN_CLIENT_ID: "login-client.apps.googleusercontent.com", GOOGLE_LOGIN_CLIENT_SECRET: "login-secret", GOOGLE_LOGIN_REDIRECT_URI: "http://127.0.0.1:4173/api/auth/google/callback" }, "GET", "/api/auth/google/start?redirectTo=/today");
  const googleLocation = googleLoginStart.headers.get("location") || "";
  assert(googleLoginStart.status === 302 && googleLocation.startsWith("https://accounts.google.com/"), "Google login start should redirect to Google");
  const googleParams = new URL(googleLocation).searchParams;
  assert(googleParams.get("client_id") === "login-client.apps.googleusercontent.com", "Google login should prefer login-specific OAuth client id");
  assert(googleParams.get("redirect_uri") === "http://127.0.0.1:4173/api/auth/google/callback", "Google login should send the configured auth callback redirect URI");
  const googleFetchBefore = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id_token: unsignedJwt({ sub: "google-sub-new-user", email: "google.new@dcdcom.com", email_verified: true, name: "Google New", picture: "https://example.com/avatar.png" }) }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const googleCallback = await request({ ...lifecycleEnv, GOOGLE_LOGIN_CLIENT_ID: "login-client.apps.googleusercontent.com", GOOGLE_LOGIN_CLIENT_SECRET: "login-secret", GOOGLE_LOGIN_REDIRECT_URI: "http://127.0.0.1:4173/api/auth/google/callback" }, "GET", `/api/auth/google/callback?state=${encodeURIComponent(googleParams.get("state"))}&code=google-code`);
    assert(googleCallback.status === 302 && googleCallback.headers.get("set-cookie")?.includes("dcdcom_session="), "Google callback should create a signed session");
    const googleCookie = googleCallback.headers.get("set-cookie").split(";")[0];
    const googleBootstrap = await request(lifecycleEnv, "GET", "/api/bootstrap", undefined, { headers: { cookie: googleCookie } });
    assert(googleBootstrap.status === 200 && googleBootstrap.body.user.email === "google.new@dcdcom.com" && googleBootstrap.body.user.fullName === "Google New", "new Google accounts should be provisioned with their Google name and email");
  } finally {
    globalThis.fetch = googleFetchBefore;
  }

  const health = await request(env, "GET", "/api/health");
  assert(health.status === 200, "health should return 200");
  assert(health.body.fileStorage === "R2", "health should expose local R2");
  assert(health.headers.get("x-content-type-options") === "nosniff", "JSON responses should include security headers");

  const readiness = await request(env, "GET", "/api/readiness");
  assert(readiness.status === 200, "readiness should return 200");
  assert(readiness.body.ready === true, "readiness should not have blocking failures in local env");
  assert(readiness.body.status === "degraded", "readiness should warn about missing OpenAI key in local env");

  const boot = await request(env, "GET", "/api/bootstrap");
  assert(boot.status === 200, "bootstrap should return 200");
  assert(boot.body.inquiries.length === 1, "bootstrap should seed one demo inquiry in fresh local env");
  assert(boot.body.personalization.savedViews.some((view) => view.name === "My open" && view.screen === "inquiries"), "bootstrap should include personalized saved inquiry views");
  assert(boot.body.user.timezone === "America/New_York", "bootstrap should include user personalization metadata");
  assert(boot.headers.get("server-timing")?.includes("app;dur="), "API responses should include server timing");
  assert(boot.headers.get("x-response-time-ms"), "API responses should include response time metadata");

  const savedView = await request(env, "POST", "/api/personalization/saved-views", {
    screen: "inquiries",
    name: "Operations review",
    filters: { status: "estimating" },
    sort: { field: "priority", direction: "asc" },
    isDefault: true
  });
  assert(savedView.status === 201 && savedView.body.savedView.name === "Operations review", "saved view endpoint should persist user workspace views");
  assert(savedView.body.savedView.filters.status === "estimating", "saved view endpoint should preserve filters");
  const bootWithSavedView = await request(env, "GET", "/api/bootstrap");
  assert(bootWithSavedView.body.personalization.savedViews.some((view) => view.id === savedView.body.savedView.id && view.is_default === true), "bootstrap should include newly saved default views");
  const auditAfterSave = await request(env, "GET", "/api/admin/audit?entityType=saved_view&limit=10");
  assert(auditAfterSave.status === 200 && auditAfterSave.body.events.some((event) => event.entity_id === savedView.body.savedView.id), "admin audit endpoint should expose saved-view changes");
  const deletedView = await request(env, "DELETE", `/api/personalization/saved-views/${savedView.body.savedView.id}`);
  assert(deletedView.status === 200 && deletedView.body.deleted === true, "saved view delete should remove user workspace views");
  const bootAfterDeleteView = await request(env, "GET", "/api/bootstrap");
  assert(!bootAfterDeleteView.body.personalization.savedViews.some((view) => view.id === savedView.body.savedView.id), "deleted saved views should disappear from bootstrap");

  const seedInquiryId = boot.body.inquiries[0].id;
  const invalidOwner = await request(env, "PATCH", `/api/inquiries/${seedInquiryId}/owner`, { ownerUserId: "user_missing" });
  assert(invalidOwner.status === 400, "owner assignment should reject users outside the account");
  const unassignedOwner = await request(env, "PATCH", `/api/inquiries/${seedInquiryId}/owner`, { ownerUserId: null });
  assert(unassignedOwner.status === 200 && unassignedOwner.body.inquiry.owner_user_id === null, "owner assignment should support unassigned inquiries");
  const assignedOwner = await request(env, "PATCH", `/api/inquiries/${seedInquiryId}/owner`, { ownerUserId: boot.body.user.id });
  assert(assignedOwner.status === 200 && assignedOwner.body.inquiry.owner_user_id === boot.body.user.id, "owner assignment should persist active account users");
  const assignedDetail = await request(env, "GET", `/api/inquiries/${seedInquiryId}`);
  assert(assignedDetail.body.inquiry.owner_name === boot.body.user.fullName, "inquiry detail should include owner metadata");
  assert(assignedDetail.body.is_watching === true && assignedDetail.body.watcher_count >= 1, "inquiry detail should include current-user watcher state");
  const bootAfterRecent = await request(env, "GET", "/api/bootstrap");
  assert(bootAfterRecent.body.personalization.recentItems.some((item) => item.entity_type === "inquiry" && item.entity_id === seedInquiryId), "viewing inquiry detail should update recent work");
  const assignedList = await request(env, "GET", "/api/inquiries?limit=1&offset=0");
  assert(assignedList.body.inquiries.some((inquiry) => inquiry.id === seedInquiryId && inquiry.owner_name === boot.body.user.fullName), "inquiry list should include owner metadata");
  const watcherHeaders = await authHeaders(secureEnv.AUTH_SESSION_SECRET, { email: "casey.ops@dcdcom.com", fullName: "Casey Operations", accountId: "acct_dcdcom" });
  const watcherBootstrap = await request(secureEnv, "GET", "/api/bootstrap", undefined, { headers: watcherHeaders });
  assert(watcherBootstrap.status === 200 && watcherBootstrap.body.user.email === "casey.ops@dcdcom.com", "signed users in the account should be bootstrapped");
  const watchedSeed = await request(secureEnv, "POST", `/api/inquiries/${seedInquiryId}/watchers`, undefined, { headers: watcherHeaders });
  assert(watchedSeed.status === 201 && watchedSeed.body.isWatching === true, "watch endpoint should subscribe the signed-in user");
  assert(watchedSeed.body.watchers.some((watcher) => watcher.email === "casey.ops@dcdcom.com"), "watch endpoint should return watcher identity metadata");
  const watcherDetail = await request(secureEnv, "GET", `/api/inquiries/${seedInquiryId}`, undefined, { headers: watcherHeaders });
  assert(watcherDetail.body.is_watching === true && watcherDetail.body.watcher_count >= 2, "detail should reflect watcher subscriptions for the signed-in user");
  const unwatchedSeed = await request(secureEnv, "DELETE", `/api/inquiries/${seedInquiryId}/watchers/me`, undefined, { headers: watcherHeaders });
  assert(unwatchedSeed.status === 200 && unwatchedSeed.body.isWatching === false, "unwatch endpoint should unsubscribe the signed-in user");
  const rewatchedSeed = await request(secureEnv, "POST", `/api/inquiries/${seedInquiryId}/watchers`, undefined, { headers: watcherHeaders });
  assert(rewatchedSeed.status === 201 && rewatchedSeed.body.isWatching === true, "watch endpoint should be idempotent after unwatching");
  const aiPrompts = await request(env, "GET", "/api/admin/ai-prompts");
  assert(aiPrompts.status === 200 && aiPrompts.body.prompts.some((prompt) => prompt.id === "intake_extraction.v2026-07-04"), "admin AI prompt registry should expose active intake prompt versions");
  assert(aiPrompts.body.prompts.some((prompt) => prompt.id === "work_product.v2026-07-04"), "admin AI prompt registry should expose active work-product prompt versions");

  const pagedInquiries = await request(env, "GET", "/api/inquiries?limit=1&offset=0");
  assert(pagedInquiries.status === 200, "paginated inquiry listing should return 200");
  assert(pagedInquiries.body.inquiries.length === 1, "paginated inquiry listing should honor limit");
  assert(pagedInquiries.body.total >= 1 && pagedInquiries.body.limit === 1, "paginated inquiry listing should include pagination metadata");

  const todayDate = dateKey(new Date(), "America/New_York");
  const today = await request(env, "GET", `/api/today?date=${todayDate}&timezone=America%2FNew_York`);
  assert(today.status === 200, "today agenda should return 200");
  assert(today.body.date === todayDate, "today agenda should preserve the selected date");
  assert(today.body.actions.some((action) => action.type === "follow_up" && action.screen === "email"), "today agenda should expose a working follow-up action");
  assert(today.body.events.some((event) => event.kind === "follow_up" && event.startMinutes === 540), "today agenda should schedule actionable workflow work");
  assert(today.body.calendar.state === "setup_required", "today agenda should explain when Google Calendar OAuth is not configured");
  const calendarStatus = await request(env, "GET", "/api/integrations/google-calendar/status");
  assert(calendarStatus.status === 200 && calendarStatus.body.connected === false, "calendar status should be safe before OAuth setup");
  const calendarConnect = await request(env, "GET", "/api/integrations/google-calendar/connect");
  assert(calendarConnect.status === 302 && calendarConnect.headers.get("location").includes("calendar=error"), "calendar connect should return users to the app with a setup error");
  const disabledCalendarFailure = describeGoogleCalendarFailure({ GOOGLE_CLIENT_ID: "123456-oauth.apps.googleusercontent.com" }, new Error("Access Not Configured."));
  assert(disabledCalendarFailure.actionLabel === "Enable Calendar API", "calendar failure should guide disabled API setup");
  const expiredCalendarFailure = describeGoogleCalendarFailure(env, new Error("invalid_grant"));
  assert(expiredCalendarFailure.actionUrl === "/api/integrations/google-calendar/connect", "calendar failure should guide expired auth to reconnect");
  const redirectCalendarFailure = describeGoogleCalendarFailure(env, new Error("redirect_uri_mismatch"));
  assert(redirectCalendarFailure.message.includes("GOOGLE_REDIRECT_URI"), "calendar failure should explain redirect URI mismatch");
  const invalidToday = await request(env, "GET", "/api/today?date=not-a-date&timezone=America%2FNew_York");
  assert(invalidToday.status === 400, "today agenda should reject invalid dates");

  const profile = await request(env, "PATCH", "/api/profile", { fullName: "Alex Production" });
  assert(profile.status === 200, "profile update should return 200");
  assert(profile.body.user.fullName === "Alex Production", "profile update should persist full name");

  const preview = await request(env, "POST", "/api/ai/intake-preview", {
    rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full decommissioning, 40 racks, cable, HVAC units, proposal, and site visit by July 15.",
    sourceChannel: "phone"
  });
  assert(preview.status === 200, "intake preview should return 200");
  assert(preview.body.promptVersionId === "intake_extraction.v2026-07-04", "intake preview should expose the prompt version used");
  assert(preview.body.extraction.company.name === "NTT Data", "intake preview should extract company");

  const structuredInquiryEmail = `From: Marcus Bennett <marcus.bennett@northstarcompute.example>

Hello DCDecom,

NorthStar Compute Services, a regional managed hosting and private-cloud provider, is requesting a formal proposal for the decommissioning of our ORD-2 data center suite.

Primary Contact
Marcus Bennett, Senior Facilities Manager
marcus.bennett@northstarcompute.example
312-555-0196
Email is preferred for scheduling and proposal questions.

Project Site
NorthStar ORD-2 Data Center Suite
1440 West Example Avenue
Elk Grove Village, IL 60007, USA

The space is a 31,500-square-foot data hall and support area inside a multi-tenant facility. The landlord turnover deadline is November 20, 2026. We need all decommissioning work completed by October 30, 2026.

Requested Scope
* Remove 72 server racks, including rear-door cooling hardware and rack-mounted PDUs.
* Remove approximately 310 servers, 58 storage arrays, and 115 network devices.
* Remove one 750 kVA UPS system and 168 battery cabinets.
* Remove four in-row cooling units after proper refrigerant recovery.
* Remove approximately 125,000 feet of copper, fiber, and power cabling.

Data Security
Approximately 260 hard drives and 140 solid-state drives require on-site NIST 800-88-compliant data sanitization. Drives that fail wiping must be physically shredded.

Electrical Responsibility
NorthStar's electrical contractor will perform all lockout/tagout and disconnects from building power.

Access and Logistics
Normal working hours are Monday through Friday, 6:00 AM to 6:00 PM. The site has a secured loading dock that can handle a 48-foot trailer. The freight elevator is rated for 6,500 pounds.

Commercial Information
Our not-to-exceed budget is $315,000 before any asset-recovery credits. I am the project lead and primary decision maker. Final contract approval will come from Elena Ramirez, Vice President of Operations.

Please provide a formal proposal by August 7, 2026.

Attached:
1. ORD-2 floor plan
2. Equipment inventory spreadsheet
3. Site photographs
4. Dock and freight elevator instructions
5. Facility contractor rules
6. Electrical disconnect responsibility matrix

Thank you,

Marcus Bennett
Senior Facilities Manager
NorthStar Compute Services`;
  const structuredPreview = await request(env, "POST", "/api/ai/intake-preview", {
    rawText: structuredInquiryEmail,
    sourceChannel: "email"
  });
  assert(structuredPreview.status === 200, "structured intake preview should return 200");
  const structuredExtraction = structuredPreview.body.extraction;
  assert(structuredExtraction.company.name === "NorthStar Compute Services", "structured intake should infer company from intro/signature");
  assert(structuredExtraction.contact.fullName === "Marcus Bennett", "structured intake should infer primary contact");
  assert(structuredExtraction.contact.email === "marcus.bennett@northstarcompute.example", "structured intake should extract contact email");
  assert(structuredExtraction.site.fullAddress.includes("1440 West Example Avenue"), "structured intake should preserve full project address");
  assert(structuredExtraction.site.city === "Elk Grove Village" && structuredExtraction.site.region === "IL", "structured intake should parse city and state");
  assert(structuredExtraction.equipment.rackCount === 72, "structured intake should extract rack count");
  assert(structuredExtraction.equipment.assets.some((asset) => asset.includes("310 servers")), "structured intake should extract server quantity");
  assert(structuredExtraction.equipment.assets.some((asset) => asset.includes("168 battery cabinets")), "structured intake should extract battery cabinets");
  assert(structuredExtraction.timeline.requestedDueDate === "2026-10-30", "structured intake should use project completion date as requested due date");
  assert(structuredExtraction.timeline.leaseEndDate === "2026-11-20", "structured intake should extract landlord turnover date");
  assert(structuredExtraction.estimateRange.highCents === 31500000, "structured intake should use stated budget as upper estimate evidence");
  const structuredMissingKeys = new Set(structuredExtraction.missingRequirements.map((item) => item.key));
  assert(!structuredMissingKeys.has("floor_plan"), "structured intake should not ask for attached floor plan");
  assert(!structuredMissingKeys.has("equipment_list"), "structured intake should not ask for attached inventory");

  const saved = await request(env, "POST", "/api/inquiries/from-source", {
    rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full decommissioning, 40 racks, cable, HVAC units, proposal, and site visit by July 15.",
    sourceChannel: "phone",
    externalMessageId: "call_001"
  });
  assert(saved.status === 201, "source intake should create inquiry");
  assert(saved.body.id, "source intake should return inquiry id");
  const savedDetail = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(savedDetail.status === 200, "newly created inquiry detail should load");
  assert(savedDetail.body.fields.some((field) => field.field_key === "company_name" && field.value_text === "NTT Data"), "source intake should persist extracted fields for inquiry detail");

  const fetchBeforeIntakeTimeout = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init = {}) => {
      if (!String(url).includes("api.openai.com")) return fetchBeforeIntakeTimeout(url, init);
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
      });
    };
    const timedOutIntake = await request({ ...env, OPENAI_API_KEY: "test-openai-key", OPENAI_INTAKE_TIMEOUT_MS: "1000" }, "POST", "/api/inquiries/from-source", {
      rawText: "Customer needs data center decommissioning for a small site in Dallas with cabinet removal, cable abatement, and a proposal next week.",
      sourceChannel: "email",
      externalMessageId: "timeout_intake_001"
    });
    assert(timedOutIntake.status === 201, "OpenAI intake timeout should still create a fallback inquiry");
    assert(timedOutIntake.body.mode === "fallback", "OpenAI intake timeout should return fallback mode");
    assert(timedOutIntake.body.error.includes("OpenAI request timed out"), "OpenAI intake timeout should explain the provider timeout");
  } finally {
    globalThis.fetch = fetchBeforeIntakeTimeout;
  }

  const savedNotifications = await request(env, "GET", "/api/notifications");
  assert(savedNotifications.status === 200, "notifications listing should return 200");
  assert(savedNotifications.body.unreadCount >= 5, "new AI-created inquiry should create unread notifications");
  const savedNotificationTypes = new Set(savedNotifications.body.notifications.map((notification) => notification.type));
  for (const type of ["lead_created", "extraction_complete", "extraction_low_confidence", "missing_information", "follow_up_needed"]) {
    assert(savedNotificationTypes.has(type), `source intake should create ${type} notification`);
  }
  const leadNotification = savedNotifications.body.notifications.find((notification) => notification.type === "lead_created" && notification.relatedInquiryId === saved.body.id);
  assert(leadNotification?.actionRoute === "detail", "lead notification should navigate to inquiry detail");
  const readNotification = await request(env, "PATCH", `/api/notifications/${leadNotification.id}`, { status: "read" });
  assert(readNotification.status === 200 && readNotification.body.notification.status === "read", "mark notification read should persist");
  const markAllNotifications = await request(env, "POST", "/api/notifications/mark-all-read");
  assert(markAllNotifications.status === 200 && markAllNotifications.body.unreadCount === 0, "mark all notifications read should clear unread count");
  const dismissedNotification = await request(env, "DELETE", `/api/notifications/${leadNotification.id}`);
  assert(dismissedNotification.status === 200 && dismissedNotification.body.notification.status === "archived", "dismiss notification should archive it");
  const visibleNotifications = await request(env, "GET", "/api/notifications");
  assert(!visibleNotifications.body.notifications.some((notification) => notification.id === leadNotification.id), "archived notifications should be hidden by default");
  const archivedNotifications = await request(env, "GET", "/api/notifications?includeArchived=true");
  assert(archivedNotifications.body.notifications.some((notification) => notification.id === leadNotification.id && notification.status === "archived"), "archived notifications should be visible when requested");

  const inboundWebhook = await request(env, "POST", "/api/intake/inbound", {
    rawText: "Email from Priya at Cushman in Washington DC. Need cable abatement estimate before lease restoration. Missing ceiling height and cable volume.",
    sourceChannel: "email",
    sender: "priya.shah@cw.example",
    subject: "Cable removal request",
    externalMessageId: "email_001"
  });
  assert(inboundWebhook.status === 202, "inbound intake endpoint should accept external messages");
  assert(inboundWebhook.body.accepted === true, "inbound intake endpoint should mark payload accepted");

  const proposal = await request(env, "POST", `/api/inquiries/${saved.body.id}/generate`, {
    type: "proposal",
    tone: "Professional"
  });
  assert(proposal.status === 201, "proposal generation should persist");
  assert(proposal.body.documentId, "proposal generation should return document id");
  assert(proposal.body.promptVersionId === "work_product.v2026-07-04", "proposal generation should expose the prompt version used");
  const proposalNotifications = await request(env, "GET", "/api/notifications");
  assert(proposalNotifications.body.notifications.some((notification) => notification.type === "proposal_ready" && notification.relatedInquiryId === saved.body.id), "proposal generation should create a proposal-ready notification");

  const detailAfterProposal = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(detailAfterProposal.status === 200, "detail after proposal should return 200");
  assert(detailAfterProposal.body.communications.some((communication) => communication.direction === "inbound"), "detail should include inbound source communication");
  const persistedProposal = detailAfterProposal.body.documents.find((document) => document.document_type === "proposal");
  assert(persistedProposal, "detail should include generated proposal document");
  assert(persistedProposal.body && persistedProposal.body.includes("Scope"), "proposal detail should include latest document body");
  assert(persistedProposal.metadata_json, "proposal detail should include document metadata");
  assert(JSON.parse(persistedProposal.metadata_json).promptVersionId === "work_product.v2026-07-04", "proposal document metadata should record prompt version");
  const filesAfterProposal = await request(env, "GET", `/api/inquiries/${saved.body.id}/files`);
  const proposalExport = filesAfterProposal.body.files.find((file) => file.category === "document_export" && file.content_type === "application/pdf");
  assert(proposalExport, "generated proposal should create a durable PDF export file");
  await env.FILES.delete(proposalExport.storage_key);
  const repairedProposalExport = await rawRequest(env, "GET", `/api/files/${proposalExport.id}`);
  assert(repairedProposalExport.status === 200, "missing generated PDF export object should be rebuilt on download");
  assert(repairedProposalExport.headers.get("content-type")?.includes("application/pdf"), "rebuilt generated PDF export should be served as a PDF");
  assert(await env.FILES.get(proposalExport.storage_key), "rebuilt generated PDF export should be written back to storage");

  const editedProposal = await request(env, "POST", `/api/inquiries/${saved.body.id}/documents`, {
    documentId: proposal.body.documentId,
    documentType: "proposal",
    title: "Edited Proposal - NTT Data",
    body: "Scope\nEdited proposal body for customer review.\n\nTerms\nEdited terms.",
    metadata: {
      confidenceScore: 80,
      approvalRequired: true,
      missingRiskNotes: ["Need access hours"],
      nextActions: ["Review proposal edits"]
    }
  });
  assert(editedProposal.status === 201, "proposal edits should save as document version");
  assert(editedProposal.body.document.currentVersion === 2, "proposal edit should increment document version");
  assert(editedProposal.body.document.body.includes("Edited proposal body"), "proposal edit should return saved body");
  const detailAfterProposalEdit = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  const editedProposalDetail = detailAfterProposalEdit.body.documents.find((document) => document.id === editedProposal.body.document.documentId);
  assert(editedProposalDetail.version_history.length === 2, "document detail should include proposal version history");
  assert(editedProposalDetail.version_history.some((version) => version.version === 1 && version.generated_by_ai), "version history should distinguish AI-generated versions");

  const reviewSubmission = await request(env, "POST", `/api/inquiries/${saved.body.id}/proposal-review`, {
    documentId: editedProposal.body.document.documentId
  });
  assert(reviewSubmission.status === 200, "proposal review submission should return 200");
  assert(reviewSubmission.body.document.status === "review", "proposal document should be marked review");
  assert(reviewSubmission.body.document.body.includes("Edited proposal body"), "proposal review should submit the edited proposal body");
  assert(reviewSubmission.body.proposal.status === "review", "proposal row should be marked review");
  assert(reviewSubmission.body.inquiry.status === "review", "inquiry should move to review");

  const badEstimate = await request(env, "POST", `/api/inquiries/${saved.body.id}/estimate`, {
    lowCents: 4500000,
    highCents: 2500000
  });
  assert(badEstimate.status === 400, "invalid estimate range should return 400");

  const savedEstimate = await request(env, "POST", `/api/inquiries/${saved.body.id}/estimate`, {
    lowCents: 2850000,
    highCents: 4500000,
    assumptions: "Approved from mobile estimate builder after rack count confirmation.",
    lineItems: [
      { lineType: "labor", description: "Labor", quantity: 1, unit: "each", unitCostCents: 1200000 },
      { lineType: "logistics", description: "Logistics", quantity: 1, unit: "each", unitCostCents: 550000 },
      { lineType: "recycling", description: "Recycling", quantity: 1, unit: "each", unitCostCents: 420000 },
      { lineType: "contingency", description: "Contingency", quantity: 1, unit: "each", unitCostCents: 280000 }
    ]
  });
  assert(savedEstimate.status === 201, "estimate save should create approved estimate");
  assert(savedEstimate.body.estimate.status === "approved", "estimate save should approve estimate");
  assert(savedEstimate.body.lineItems.length === 4, "estimate save should persist line items");
  assert(savedEstimate.body.inquiry.status === "estimating", "estimate save should move inquiry to estimating");
  assert(savedEstimate.body.inquiry.estimated_low_cents === 2850000, "estimate save should update low range");

  const detailsUpdate = await request(env, "PATCH", `/api/inquiries/${saved.body.id}/details`, {
    contact: "Tom Rivera",
    email: "tom.rivera@nttdata.example",
    phone: "(571) 555-0190",
    accessNotes: "Security escort required"
  });
  assert(detailsUpdate.status === 200, "detail update should return 200");
  assert(detailsUpdate.body.details.full_name === "Tom Rivera", "detail update should persist contact name");

  const detailAfterDetails = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(detailAfterDetails.body.inquiry.contact_name === "Tom Rivera", "detail readback should include updated contact");
  assert(detailAfterDetails.body.inquiry.access_notes === "Security escort required", "detail readback should include updated access notes");
  assert(detailAfterDetails.body.fields.some((field) => field.field_key === "access_requirements" && field.value_text === "Security escort required"), "detail update should refresh extracted field");
  const staleDetails = await request(env, "PATCH", `/api/inquiries/${saved.body.id}/details`, {
    contact: "Stale Contact",
    email: "stale@example.com",
    phone: "(571) 555-0000",
    accessNotes: "This should not win",
    expectedUpdatedAt: "2000-01-01T00:00:00.000Z"
  });
  assert(staleDetails.status === 409 && staleDetails.body.code === "stale_resource", "stale inquiry detail edits should return a concurrency conflict");

  const emailDraftV1 = await request(env, "POST", `/api/inquiries/${saved.body.id}/documents`, {
    documentType: "follow_up_email",
    title: "Follow-up Email - NTT Data",
    subject: "Quick follow-up on your data center project",
    body: "Edited follow-up v1",
    metadata: {
      confidenceScore: 78,
      approvalRequired: false,
      missingRiskNotes: ["Need access hours"],
      nextActions: ["Review/send follow-up email"]
    }
  });
  assert(emailDraftV1.status === 201, "manual email draft should save");
  assert(emailDraftV1.body.document.currentVersion === 1, "first manual draft should create version 1");
  assert(emailDraftV1.body.document.documentId, "manual draft should return document id");
  const staleEmailDraft = await request(env, "POST", `/api/inquiries/${saved.body.id}/documents`, {
    documentId: emailDraftV1.body.document.documentId,
    documentType: "follow_up_email",
    title: "Follow-up Email - NTT Data",
    subject: "Quick follow-up on your data center project",
    body: "Stale edit",
    expectedVersion: 99
  });
  assert(staleEmailDraft.status === 409 && staleEmailDraft.body.code === "stale_resource", "stale document edits should return a version conflict");

  const emailDraftV2 = await request(env, "POST", `/api/inquiries/${saved.body.id}/documents`, {
    documentId: emailDraftV1.body.document.documentId,
    documentType: "follow_up_email",
    title: "Follow-up Email - NTT Data",
    subject: "Quick follow-up on your data center project",
    body: "Edited follow-up v2",
    expectedVersion: emailDraftV1.body.document.currentVersion,
    metadata: {
      confidenceScore: 82,
      approvalRequired: false,
      missingRiskNotes: ["Need access hours"],
      nextActions: ["Review/send follow-up email"]
    }
  });
  assert(emailDraftV2.status === 201, "manual email draft update should save");
  assert(emailDraftV2.body.document.currentVersion === 2, "second manual draft should create version 2");

  const detailAfterEmail = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  const persistedEmail = detailAfterEmail.body.documents.find((document) => document.document_type === "follow_up_email");
  assert(persistedEmail, "detail should include saved follow-up email");
  assert(persistedEmail.body === "Edited follow-up v2", "detail should expose latest edited email body");
  assert(persistedEmail.generated_by_ai === 0, "manual email version should not be marked AI-generated");

  const sentFollowUp = await request(env, "POST", `/api/inquiries/${saved.body.id}/send-follow-up`, {
    documentId: emailDraftV2.body.document.documentId,
    subject: "Quick follow-up on your data center project",
    body: "Could you send the floor plan, access hours, and utility shutoff requirements?",
    channel: "email"
  });
  assert(sentFollowUp.status === 202, "follow-up send should queue without provider webhook");
  assert(sentFollowUp.body.communication.status === "queued", "follow-up communication should be queued");
  assert(sentFollowUp.body.delivery.status === "queued", "delivery attempt should be queued");
  assert(sentFollowUp.body.document.currentVersion === 3, "queued follow-up should save a new document version");

  const communications = await request(env, "GET", `/api/inquiries/${saved.body.id}/communications`);
  assert(communications.status === 200, "communications listing should return 200");
  assert(communications.body.communications.some((communication) => communication.direction === "outbound" && communication.status === "queued"), "communications listing should include queued outbound follow-up");
  const internalNote = await request(env, "POST", `/api/inquiries/${saved.body.id}/communications`, {
    direction: "inbound",
    channel: "internal_note",
    subject: "Internal note",
    body: "Customer prefers early access window.",
    status: "logged"
  });
  assert(internalNote.status === 201 && internalNote.body.communication.channel === "internal_note", "internal notes should be saved as logged communications");
  const comment = await request(env, "POST", `/api/inquiries/${saved.body.id}/comments`, {
    body: "Please review access assumptions with @casey.ops@dcdcom.com before proposal release."
  });
  assert(comment.status === 201 && comment.body.comment.mentions.some((mention) => mention.email === "casey.ops@dcdcom.com"), "comments should resolve teammate mentions");
  const comments = await request(env, "GET", `/api/inquiries/${saved.body.id}/comments`);
  assert(comments.status === 200 && comments.body.comments.some((entry) => entry.id === comment.body.comment.id), "comments listing should include posted comments");
  const detailAfterComment = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(detailAfterComment.body.comments.some((entry) => entry.body.includes("access assumptions")), "inquiry detail should include comments");
  const mentionNotifications = await request(secureEnv, "GET", "/api/notifications?includeArchived=true", undefined, { headers: watcherHeaders });
  assert(mentionNotifications.body.notifications.some((notification) => notification.title === "You were mentioned" && notification.relatedInquiryId === saved.body.id), "mentions should notify the referenced teammate");

  const detailBeforeMissing = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  const missingRequirement = detailBeforeMissing.body.missing[0];
  assert(missingRequirement?.id, "detail should expose missing requirement ids");
  const requestedMissing = await request(env, "PATCH", `/api/missing-requirements/${missingRequirement.id}`, { status: "requested" });
  assert(requestedMissing.status === 200, "missing requirement request should persist");
  assert(requestedMissing.body.requirement.status === "requested", "missing requirement should move to requested");
  const receivedMissing = await request(env, "PATCH", `/api/missing-requirements/${missingRequirement.id}`, { status: "received" });
  assert(receivedMissing.status === 200, "missing requirement receipt should persist");
  assert(receivedMissing.body.requirement.status === "received", "missing requirement should move to received");
  await env.DB.prepare("INSERT INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("miss_test_equipment_list", saved.body.id, "equipment_list", "Equipment list", "documentation", "medium", "open", "Customer should provide the equipment inventory.").run();
  await env.DB.prepare("INSERT INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("miss_test_contract", saved.body.id, "contract", "Contract", "commercial", "medium", "open", "Contract or agreement is needed.").run();
  await env.DB.prepare("INSERT INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("miss_test_email_attachment", saved.body.id, "email_attachment", "Email attachment", "documentation", "medium", "open", "Customer email attachment is needed.").run();

  const siteVisit = await request(env, "POST", `/api/inquiries/${saved.body.id}/site-visits`, {
    checklist: ["Confirm access", "Photograph racks", "Validate disconnect scope"]
  });
  assert(siteVisit.status === 201, "site visit schedule should persist");
  assert(siteVisit.body.siteVisit.status === "scheduled", "site visit should be scheduled");
  assert(siteVisit.body.siteVisit.checklistItems.length >= 3, "site visit should include checklist items");
  assert(siteVisit.body.calendarSync.status === "not_connected", "site visit should clearly report when no real Google Calendar connection exists");

  const checklistItem = siteVisit.body.siteVisit.checklistItems[0];
  const checklistUpdate = await request(env, "PATCH", `/api/checklist-items/${checklistItem.id}`, { status: "done" });
  assert(checklistUpdate.status === 200, "checklist item update should persist");
  assert(checklistUpdate.body.checklistItem.status === "done", "checklist item should move to done");

  const siteVisits = await request(env, "GET", `/api/inquiries/${saved.body.id}/site-visits`);
  assert(siteVisits.status === 200, "site visits listing should return 200");
  assert(siteVisits.body.siteVisits.some((visit) => visit.checklistItems.some((item) => item.status === "done")), "site visits listing should expose updated checklist state");

  const visitDate = dateKey(new Date(siteVisit.body.siteVisit.scheduled_start), "America/New_York");
  const visitAgenda = await request(env, "GET", `/api/today?date=${visitDate}&timezone=America%2FNew_York`);
  assert(visitAgenda.status === 200, "scheduled visit agenda should return 200");
  assert(visitAgenda.body.events.some((event) => event.visitId === siteVisit.body.siteVisit.id && event.source === "calendar"), "today agenda should expose persisted site visits");

  const form = new FormData();
  form.append("category", "floor_plan");
  form.append("file", new File(["floor plan placeholder"], "floor-plan.txt", { type: "text/plain" }));
  const upload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, form);
  assert(upload.status === 201, "file upload should persist");
  assert(upload.body.file.id, "file upload should return file id");
  assert(upload.body.file.contentHash?.length === 64, "file upload should return a SHA-256 content hash");
  const duplicateForm = new FormData();
  duplicateForm.append("category", "floor_plan");
  duplicateForm.append("file", new File(["floor plan placeholder"], "floor-plan-copy.txt", { type: "text/plain" }));
  const duplicateUpload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, duplicateForm);
  assert(duplicateUpload.status === 200 && duplicateUpload.body.duplicate === true, "duplicate uploads should reuse the existing file record");
  assert(duplicateUpload.body.file.id === upload.body.file.id, "duplicate uploads should return the original file id");

  const equipmentForm = new FormData();
  equipmentForm.append("category", "equipment_list");
  equipmentForm.append("file", new File(["rack inventory"], "equipment-list.txt", { type: "text/plain" }));
  const equipmentUpload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, equipmentForm);
  assert(equipmentUpload.status === 201, "equipment list upload should persist");

  const contractForm = new FormData();
  contractForm.append("category", "contract");
  contractForm.append("file", new File(["contract terms"], "contract.txt", { type: "text/plain" }));
  const contractUpload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, contractForm);
  assert(contractUpload.status === 201, "contract upload should persist");

  const attachmentForm = new FormData();
  attachmentForm.append("category", "email_attachment");
  attachmentForm.append("file", new File(["customer attachment"], "email-attachment.txt", { type: "text/plain" }));
  const attachmentUpload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, attachmentForm);
  assert(attachmentUpload.status === 201, "email attachment upload should persist");

  const detailAfterEvidenceUploads = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  for (const key of ["floor_plan", "equipment_list", "contract", "email_attachment"]) {
    assert(detailAfterEvidenceUploads.body.missing.some((item) => item.requirement_key === key && item.status === "received"), `${key} upload should mark the matching missing requirement received`);
  }

  const files = await request(env, "GET", `/api/inquiries/${saved.body.id}/files`);
  assert(files.status === 200, "file listing should return 200");
  assert(files.body.files.some((file) => file.file_name === "floor-plan.txt" && file.content_type === "text/plain"), "file listing should include uploaded file");
  assert(files.body.files.filter((file) => file.content_hash === upload.body.file.contentHash).length === 1, "file listing should not duplicate exact content hashes");

  const selectedSourceGeneration = await request(env, "POST", `/api/inquiries/${saved.body.id}/generate`, {
    type: "scope_of_work",
    tone: "Professional",
    sourceDocumentIds: [upload.body.file.id, equipmentUpload.body.file.id],
    additionalContext: "Make this client-facing and focus on cable abatement."
  });
  assert(selectedSourceGeneration.status === 201, "source-selected generation should persist");
  const detailAfterSelectedGeneration = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  const selectedScope = detailAfterSelectedGeneration.body.documents.find((document) => document.id === selectedSourceGeneration.body.documentId);
  const selectedMetadata = JSON.parse(selectedScope.metadata_json);
  assert(selectedMetadata.generationContext.additionalContext.includes("client-facing"), "generated document metadata should retain user instructions");
  assert(selectedMetadata.generationContext.sourceDocuments.length === 2, "generated document metadata should retain selected source documents");
  assert(selectedMetadata.generationContext.sourceDocuments.some((file) => file.fileName === "floor-plan.txt"), "selected floor plan should be passed into generation context");
  assert(!selectedMetadata.generationContext.sourceDocuments.some((file) => file.fileName === "contract.txt"), "unselected source documents should not be passed as selected generation context");

  const badImageForm = new FormData();
  badImageForm.append("category", "photo");
  badImageForm.append("file", new File(["not an image"], "fake.png", { type: "image/png" }));
  const badImage = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, badImageForm);
  assert(badImage.status === 415, "upload hardening should reject fake image files");

  const photoForm = new FormData();
  photoForm.append("category", "photo");
  photoForm.append("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "site-photo.png", { type: "image/png" }));
  const photoUpload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, photoForm);
  assert(photoUpload.status === 201, "photo upload should persist");
  assert(photoUpload.body.file.category === "photo", "photo upload should preserve its category");
  assert(photoUpload.body.file.thumbnailStatus === "generated" && photoUpload.body.file.thumbnailUrl?.endsWith("/thumbnail"), "photo upload should expose a generated thumbnail URL");
  const photoThumbnail = await rawRequest(env, "GET", `/api/files/${photoUpload.body.file.id}/thumbnail`);
  assert(photoThumbnail.status === 200, "generated file thumbnail should return 200");
  assert(photoThumbnail.headers.get("content-type")?.includes("image/svg+xml"), "generated thumbnails should be served as SVG previews");
  assert(photoThumbnail.headers.get("x-source-content-sha256") === photoUpload.body.file.contentHash, "generated thumbnails should point back to the source hash");
  const filesAfterPhoto = await request(env, "GET", `/api/inquiries/${saved.body.id}/files`);
  assert(filesAfterPhoto.body.files.some((file) => file.file_name === "site-photo.png" && file.content_type === "image/png" && file.thumbnail_status === "generated"), "file listing should expose uploaded site photos with thumbnail status");

  const download = await rawRequest(env, "GET", `/api/files/${upload.body.file.id}`);
  assert(download.status === 200, "file download should return 200");
  assert(download.headers.get("content-security-policy") === "sandbox", "file downloads should be sandboxed");
  assert(download.headers.get("cache-control")?.includes("no-store"), "file downloads should avoid shared caching");
  assert(download.headers.get("x-content-sha256") === upload.body.file.contentHash, "file downloads should expose the content hash header");
  assert(await download.text() === "floor plan placeholder", "file download should return uploaded bytes");
  const shareLink = await request(env, "POST", `/api/files/${upload.body.file.id}/share-links`, { label: "Customer floor plan" });
  assert(shareLink.status === 201 && shareLink.body.shareLink.publicUrl.includes("/share/files/"), "file share endpoint should create a signed external link");
  assert(shareLink.body.shareLink.expiresAt, "file share endpoint should set an expiry");
  const publicPath = new URL(shareLink.body.shareLink.publicUrl).pathname;
  const publicDownload = await publicRawRequest(env, "GET", publicPath);
  assert(publicDownload.status === 200, "signed external share link should download without app authentication");
  assert(publicDownload.headers.get("x-content-sha256") === upload.body.file.contentHash, "signed external share downloads should expose integrity headers");
  assert(await publicDownload.text() === "floor plan placeholder", "signed external share downloads should return uploaded bytes");
  const listedShares = await request(env, "GET", `/api/files/${upload.body.file.id}/share-links`);
  assert(listedShares.status === 200 && listedShares.body.shareLinks.some((link) => link.id === shareLink.body.shareLink.id && link.active === true), "file share listing should include active signed links");
  const revokedShare = await request(env, "DELETE", `/api/file-share-links/${shareLink.body.shareLink.id}`);
  assert(revokedShare.status === 200 && revokedShare.body.shareLink.active === false, "file share revoke should deactivate the link");
  const revokedDownload = await publicRawRequest(env, "GET", publicPath);
  assert(revokedDownload.status === 404, "revoked external share links should stop downloading");

  const defaultRetention = await request(env, "GET", "/api/admin/file-retention");
  assert(defaultRetention.status === 200 && defaultRetention.body.policy.retention_days === 365, "file retention endpoint should expose a default policy");
  const retentionPolicy = await request(env, "PUT", "/api/admin/file-retention", {
    retentionDays: 90,
    archiveAfterDays: 45,
    legalHold: false
  });
  assert(retentionPolicy.status === 200 && retentionPolicy.body.policy.retention_days === 90, "admins should be able to update file retention policy");
  const storedFloorPlan = files.body.files.find((file) => file.id === upload.body.file.id);
  await env.DB.prepare("UPDATE files SET uploaded_at = ? WHERE id = ?").bind("2020-01-01T00:00:00.000Z", upload.body.file.id).run();
  const retentionPreview = await request(env, "POST", "/api/admin/file-retention/run", { dryRun: true, limit: 10 });
  assert(retentionPreview.status === 200 && retentionPreview.body.dryRun === true, "file retention cleanup should support dry-run previews");
  assert(retentionPreview.body.candidates.some((file) => file.id === upload.body.file.id), "file retention preview should include files past retention");
  assert(await env.FILES.get(storedFloorPlan.storage_key) !== null, "file retention dry-run should not delete storage objects");

  const storedContract = files.body.files.find((file) => file.id === contractUpload.body.file.id);
  const deletedContract = await request(env, "DELETE", `/api/files/${contractUpload.body.file.id}`);
  assert(deletedContract.status === 200, "file deletion should return 200");
  assert(deletedContract.body.deleted === true, "file deletion should confirm deletion");
  assert(await env.FILES.get(storedContract.storage_key) === null, "file deletion should remove the object from storage");
  const deletedContractDownload = await rawRequest(env, "GET", `/api/files/${contractUpload.body.file.id}`);
  assert(deletedContractDownload.status === 404, "deleted file should no longer be downloadable");
  const filesAfterContractDelete = await request(env, "GET", `/api/inquiries/${saved.body.id}/files`);
  assert(!filesAfterContractDelete.body.files.some((file) => file.id === contractUpload.body.file.id), "file deletion should remove the database record");

  const settings = await request(env, "PUT", "/api/settings", {
    highPriorityAlerts: true,
    leaseDeadlineReminders: true,
    dailyDigest: true,
    defaultView: "docs",
    timezone: "America/Chicago",
    theme: "dark"
  });
  assert(settings.status === 200, "settings save should return 200");
  assert(settings.body.preferences.notification_digest === "daily", "settings should persist digest");
  assert(settings.body.preferences.default_view === "docs", "settings should persist default view");
  assert(settings.body.preferences.timezone === "America/Chicago", "settings should persist timezone");
  assert(JSON.parse(settings.body.preferences.settings_json).theme === "dark", "settings should persist theme preference");

  const integration = await request(env, "POST", "/api/integrations", { provider: "crm" });
  assert(integration.status === 201, "integration connect should return 201");
  assert(integration.body.integration.status === "connected", "integration should be connected");

  const sync = await request(env, "POST", `/api/inquiries/${saved.body.id}/sync`, { provider: "crm" });
  assert(sync.status === 201, "sync should return 201");
  assert(sync.body.sync.status === "queued", "sync should queue safely without provider credentials");
  assert(sync.body.sync.nextRetryAfterSeconds === 300, "queued sync should expose retry guidance");
  const providerQueue = await request(env, "GET", "/api/admin/provider-queue?limit=20");
  assert(providerQueue.status === 200, "provider queue should return 200 for admins");
  assert(providerQueue.body.items.some((item) => item.type === "sync" && item.status === "queued" && item.operation === "upsert_opportunity"), "provider queue should expose queued CRM sync events");
  assert(providerQueue.body.items.some((item) => item.type === "delivery" && item.status === "queued" && item.operation === "email"), "provider queue should expose queued outbound delivery attempts");

  const originalFetch = globalThis.fetch;
  const providerRequests = [];
  try {
    globalThis.fetch = async (url, init) => {
      providerRequests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "crm_live_123" }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const liveSync = await request({ ...env, CRM_PROVIDER_WEBHOOK: "https://crm.example/sync" }, "POST", `/api/inquiries/${saved.body.id}/sync`, { provider: "crm" });
    assert(liveSync.status === 201, "configured sync should return 201");
    assert(liveSync.body.sync.status === "success", "configured sync should record provider success");
    assert(liveSync.body.sync.response.id === "crm_live_123", "configured sync should expose provider response");
    assert(providerRequests[0].url === "https://crm.example/sync", "configured sync should call the provider webhook");
    assert(providerRequests[0].body.inquiryId === saved.body.id, "configured sync should send the inquiry id to the provider");

    globalThis.fetch = async () => new Response(JSON.stringify({ error: "temporarily unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    const failedSync = await request({ ...env, CRM_PROVIDER_WEBHOOK: "https://crm.example/sync" }, "POST", `/api/inquiries/${saved.body.id}/sync`, { provider: "crm" });
    assert(failedSync.status === 201, "provider sync failure should still persist an event");
    assert(failedSync.body.sync.status === "failed", "provider sync failure should be explicit");
    assert(failedSync.body.sync.response.error === "temporarily unavailable", "provider sync failure should expose provider response body");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const invalidStatus = await request(env, "PATCH", `/api/inquiries/${saved.body.id}/status`, { status: "review" });
  assert(invalidStatus.status === 409, "status update should reject invalid workflow jumps");
  assert(invalidStatus.body.allowed.includes("proposal"), "status rejection should expose allowed next states");
  const watchedSavedInquiry = await request(secureEnv, "POST", `/api/inquiries/${saved.body.id}/watchers`, undefined, { headers: watcherHeaders });
  assert(watchedSavedInquiry.status === 201 && watchedSavedInquiry.body.isWatching === true, "teammates should be able to watch active inquiries");
  const status = await request(env, "PATCH", `/api/inquiries/${saved.body.id}/status`, { status: "proposal" });
  assert(status.status === 200, "status update should return 200");
  assert(status.body.inquiry.status === "proposal", "status update should persist valid workflow transitions");
  const watcherNotifications = await request(secureEnv, "GET", "/api/notifications?includeArchived=true", undefined, { headers: watcherHeaders });
  assert(watcherNotifications.body.notifications.some((notification) => notification.type === "status_changed" && notification.relatedInquiryId === saved.body.id && notification.title === "Watched inquiry changed"), "watched inquiries should notify subscribed teammates about status changes");

  const fetchBeforeAiTimeout = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init = {}) => {
      if (!String(url).includes("api.openai.com")) return fetchBeforeAiTimeout(url, init);
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
      });
    };
    const timedOutGeneration = await request({ ...env, OPENAI_API_KEY: "test-openai-key", OPENAI_REQUEST_TIMEOUT_MS: "1000" }, "POST", `/api/inquiries/${saved.body.id}/generate`, {
      type: "scope_of_work",
      tone: "Professional"
    });
    assert(timedOutGeneration.status === 201, "OpenAI timeout should still persist a fallback generated document");
    assert(timedOutGeneration.body.mode === "fallback", "OpenAI timeout should return fallback mode");
    assert(timedOutGeneration.body.error.includes("OpenAI request timed out"), "OpenAI timeout should explain the provider timeout");
    assert(timedOutGeneration.body.documentId, "OpenAI timeout fallback should return a document id");
  } finally {
    globalThis.fetch = fetchBeforeAiTimeout;
  }

  const storedDocumentKey = files.body.files.find((file) => file.file_name === "floor-plan.txt").storage_key;
  const storedPhoto = filesAfterPhoto.body.files.find((file) => file.file_name === "site-photo.png");
  const deletedInquiry = await request(env, "DELETE", `/api/inquiries/${saved.body.id}`);
  assert(deletedInquiry.status === 200, "inquiry deletion should return 200");
  assert(deletedInquiry.body.deleted === true, "inquiry deletion should confirm deletion");
  assert(deletedInquiry.body.inquiry.deletedFiles >= 2, "inquiry deletion should report removed stored files");
  assert(await env.FILES.get(storedDocumentKey) === null, "inquiry deletion should remove document objects from storage");
  assert(await env.FILES.get(storedPhoto.storage_key) === null, "inquiry deletion should remove photo objects from storage");
  const deletedDetail = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(deletedDetail.status === 404, "deleted inquiry should no longer be readable");
  const deletedFile = await rawRequest(env, "GET", `/api/files/${upload.body.file.id}`);
  assert(deletedFile.status === 404, "deleted inquiry files should no longer be downloadable");
  for (const table of ["inquiry_sources", "inquiry_watchers", "inquiry_comments", "file_share_links", "extracted_fields", "missing_requirements", "ai_summaries", "ai_runs", "estimates", "site_visits", "documents", "proposals", "communications", "files", "activity_events", "sync_events", "notifications"]) {
    assert(await countRows(env, table, "inquiry_id", saved.body.id) === 0, `${table} should not retain deleted inquiry records`);
  }
  assert(await countRows(env, "audit_log", "entity_id", saved.body.id) === 0, "audit log should not retain deleted inquiry entries");
  const duplicateDelete = await request(env, "DELETE", `/api/inquiries/${saved.body.id}`);
  assert(duplicateDelete.status === 404, "deleting a missing inquiry should return 404");

  const remainingInquiries = await request(env, "GET", "/api/inquiries");
  for (const inquiry of remainingInquiries.body.inquiries) {
    const cleanup = await request(env, "DELETE", `/api/inquiries/${inquiry.id}`);
    assert(cleanup.status === 200, "test workspace cleanup should delete each remaining inquiry");
  }
  const emptyWorkspace = await request(env, "GET", "/api/bootstrap");
  assert(emptyWorkspace.body.inquiries.length === 0, "an intentionally emptied workspace should not reseed demo inquiries");

  console.log("API smoke tests passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}

async function request(env, method, path, payload, options = {}) {
  const response = await rawRequest(env, method, path, payload, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body, headers: response.headers };
}

async function rawRequest(env, method, path, payload, options = {}) {
  const init = { method, headers: new Headers({ "oai-authenticated-user-email": "alex@dcdcom.com" }) };
  for (const [key, value] of Object.entries(options.headers || {})) init.headers.set(key, value);
  if (payload instanceof FormData) {
    init.body = payload;
  } else if (payload !== undefined) {
    init.headers.set("content-type", "application/json");
    init.body = JSON.stringify(payload);
  }
  return handleApi(new Request(`http://local.test${path}`, init), env);
}

async function publicRawRequest(env, method, path) {
  return app.fetch(new Request(`http://local.test${path}`, { method }), env);
}

async function authHeaders(secret, payload) {
  const body = base64UrlEncode(JSON.stringify({ sub: `user_${payload.email.replace(/[^a-z0-9]+/g, "_")}`, email: payload.email, fullName: payload.fullName, accountId: payload.accountId, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const signature = await hmac(secret, body);
  return { authorization: `Bearer ${body}.${signature}` };
}

async function hmac(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unsignedJwt(payload) {
  return `${base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }))}.${base64UrlEncode(JSON.stringify(payload))}.`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dateKey(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function countRows(env, table, column, value) {
  const allowedTables = new Set(["inquiry_sources", "inquiry_watchers", "inquiry_comments", "file_share_links", "extracted_fields", "missing_requirements", "ai_summaries", "ai_runs", "estimates", "site_visits", "documents", "proposals", "communications", "files", "activity_events", "sync_events", "notifications", "audit_log"]);
  if (!allowedTables.has(table) || !["inquiry_id", "entity_id"].includes(column)) throw new Error("Unsupported deletion verification query");
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).bind(value).first();
  return Number(row?.count || 0);
}
