import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { zValidator } from "@hono/zod-validator";
import { analyzeIntake, extractionToPreview, generateAssistantResponse, generateWorkProduct, listAiPromptRegistry } from "../ai/index.js";
import { acceptInvite, authenticateRequest, changePassword, completeGoogleLogin, createGoogleLoginRedirect, createInvite, listAccountUsers, listActiveSessions, loginWithPassword, logoutSession, readCurrentUser, readSession, requestPasswordReset, resetPassword, revokeSession, requireAdminAccess, requireWriteAccess, signupWithPassword, updateAccountUser } from "../auth/index.js";
import { ensureDatabase } from "../db/client.js";
import { ensureBootstrap, publicUser, readinessReport } from "../services/bootstrap.js";
import { completeGoogleCalendarOAuth, createGoogleCalendarAuthUrl, describeGoogleCalendarFailure, getGoogleCalendarEvents, getGoogleCalendarStatus } from "../integrations/google-calendar.js";
import { createRequestTelemetry } from "../middleware/observability.js";
import { acceptInviteSchema, activitySchema, assignmentSchema, auditQuerySchema, changePasswordSchema, chatCreateDraftSchema, chatMessageSchema, chatSaveNoteSchema, chatSessionQuerySchema, chatSessionSchema, checklistSchema, commentSchema, communicationSchema, createInviteSchema, detailsSchema, documentSchema, emailRequestSchema, estimateSchema, fileRetentionPolicySchema, fileRetentionRunSchema, fileShareSchema, followUpSchema, generateSchema, inquiryListQuerySchema, intakeSchema, integrationSchema, loginSchema, notificationQuerySchema, notificationSchema, profileSchema, providerQueueQuerySchema, requirementSchema, resetPasswordSchema, reviewSchema, savedViewSchema, settingsSchema, signupSchema, siteVisitSchema, statusSchema, syncSchema, todayQuerySchema, updateUserAdminSchema } from "../../shared/contracts/index.js";
import { buildChatContext, createActivity, createChatFileRecord, createChatMessage, createChatSession, createChatSources, createFileRecord, createFileShareLink, createGeneratedWorkProduct, createInquiry, createInquiryComment, createInquiryFromExtraction, createNotification, deleteFileRecord, deleteInquiry, deleteSavedView, dismissNotification, ensureChatSession, getAiUsageReport, getChatMessage, getChatSession, getFileByContentHash, getFileForDownload, getFileRetentionPolicy, getInquiryDetail, getSharedFileForDownload, getTodayWorkspace, getUserPreferences, getUserWorkspaceState, listAuditEvents, listChatFilesForSession, listChatMessages, listChatSessions, listCommunications, listFileShareLinks, listFilesForInquiry, listInquiries, listIntegrations, listNotifications, listProviderQueue, listSiteVisits, listInquiryComments, listInquiryWatchers, logCommunication, markAllNotificationsRead, markNotificationRead, rebuildDocumentExportObject, recordAiRun, recordRecentItem, revokeFileShareLink, runFileRetentionCleanup, saveDocumentDraft, saveEstimateForInquiry, scheduleSiteVisit, sendOutboundCommunication, storeFileThumbnail, submitProposalForReview, syncInquiry, unwatchInquiry, updateChecklistItem, updateFileRetentionPolicy, updateInquiryDetails, updateInquiryOwner, updateInquiryStatus, updateMissingRequirement, updateUserPreferences, updateUserProfile, upsertIntegration, upsertSavedView, watchInquiry } from "../repositories/index.js";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const chatRateLimits = new Map();
export const app = new Hono();

app.get("/share/files/:token", async (c) => {
  if (!c.env?.DB) return c.json({ error: "File sharing is not configured." }, 503);
  if (!c.env?.FILES) return c.json({ error: "File storage is not configured." }, 503);
  await ensureDatabase(c.env);
  const shared = await getSharedFileForDownload(c.env, c.req.param("token"));
  if (!shared) return c.json({ error: "Share link is invalid, expired, or revoked." }, 404);
  let file = shared.file;
  let object = await c.env.FILES.get(file.storage_key);
  if (!object) {
    file = await rebuildDocumentExportObject(c.env, file.id) || file;
    object = await c.env.FILES.get(file.storage_key);
  }
  if (!object) return c.json({ error: "Stored file object not found" }, 404);
  return new Response(object.body, { headers: { ...fileDownloadHeaders(file, object), "cache-control": "private, no-store" } });
});

app.use("/api/*", secureHeaders());
app.use("/api/*", async (c, next) => {
  if (!c.env?.DB) return c.json({ ok: false, error: "D1 binding DB is not configured in this environment.", expectedBinding: "DB" }, 503);
  await ensureDatabase(c.env);
  if (new URL(c.req.url).pathname.startsWith("/api/auth/")) {
    const telemetry = createRequestTelemetry(c.req.raw, null, null);
    await next();
    c.header("cache-control", "no-store");
    telemetry.finish(c.res);
    return;
  }
  const context = await authenticateRequest(c.env, c.req.raw);
  if (context.response) return context.response;
  const { user, accountId } = context;
  c.set("user", user);
  c.set("accountId", accountId);
  const telemetry = createRequestTelemetry(c.req.raw, user, accountId);
  if (csrfProtectionFailed(c.req.raw, c.env)) {
    c.header("cache-control", "no-store");
    const response = c.json({ error: "Cross-site request blocked.", code: "csrf_origin_mismatch" }, 403);
    telemetry.finish(response);
    return response;
  }
  await ensureBootstrap(c.env, user, accountId);
  await next();
  c.header("cache-control", "no-store");
  telemetry.finish(c.res);
});

app.post("/api/auth/login", zValidator("json", loginSchema), async (c) => loginWithPassword(c.env, c.req.raw, c.req.valid("json")));
app.post("/api/auth/signup", zValidator("json", signupSchema), async (c) => signupWithPassword(c.env, c.req.raw, c.req.valid("json")));
app.post("/api/auth/logout", async (c) => logoutSession(c.env, c.req.raw));
app.get("/api/auth/session", async (c) => readSession(c.env, c.req.raw));
app.post("/api/auth/refresh", async (c) => readSession(c.env, c.req.raw));
app.get("/api/auth/google/start", async (c) => createGoogleLoginRedirect(c.env, c.req.raw));
app.get("/api/auth/google/callback", async (c) => completeGoogleLogin(c.env, c.req.raw));
app.post("/api/auth/forgot-password", zValidator("json", emailRequestSchema), async (c) => requestPasswordReset(c.env, c.req.raw, c.req.valid("json")));
app.post("/api/auth/reset-password", zValidator("json", resetPasswordSchema), async (c) => resetPassword(c.env, c.req.raw, c.req.valid("json")));
app.post("/api/auth/accept-invite", zValidator("json", acceptInviteSchema), async (c) => acceptInvite(c.env, c.req.raw, c.req.valid("json")));

app.get("/api/health", (c) => c.json({ ok: true, database: "D1 via Drizzle", binding: "DB", fileStorage: c.env?.FILES ? "R2" : "not_configured", router: "Hono" }));
app.get("/api/readiness", async (c) => c.json(await readinessReport(c.env, c.get("user"), accountId(c))));
app.get("/api/bootstrap", async (c) => {
  const user = c.get("user");
  const [inquiries, preferences, integrations, personalization] = await Promise.all([listInquiries(c.env, accountId(c)), getUserPreferences(c.env, user.id), listIntegrations(c.env, accountId(c)), getUserWorkspaceState(c.env, user.id)]);
  const currentUser = await readCurrentUser(c.env, accountId(c), user);
  return c.json({ accountId: accountId(c), user: currentUser ? publicUser(currentUser) : user, preferences, personalization, integrations, inquiries });
});
app.get("/api/today", zValidator("query", todayQuerySchema), async (c) => {
  const { date, timezone } = c.req.valid("query");
  const [workspace, calendar] = await Promise.all([
    getTodayWorkspace(c.env, accountId(c), c.get("user").id, date, timezone),
    getGoogleCalendarEvents(c.env, accountId(c), date, timezone)
  ]);
  const events = [...workspace.events, ...calendar.events].sort((left, right) => left.startMinutes - right.startMinutes);
  return c.json({ ...workspace, events, calendar: calendar.status });
});

app.get("/api/settings", async (c) => c.json({ preferences: await getUserPreferences(c.env, c.get("user").id) }));
app.put("/api/settings", writeAccess, zValidator("json", settingsSchema), async (c) => {
  const preferences = await updateUserPreferences(c.env, accountId(c), c.get("user").id, c.req.valid("json"));
  if (preferences?.error) return c.json({ error: preferences.error, code: preferences.code, detail: preferences.detail }, preferences.statusCode || 409);
  return c.json({ preferences });
});
app.patch("/api/profile", writeAccess, zValidator("json", profileSchema), async (c) => {
  const profile = await updateUserProfile(c.env, accountId(c), c.get("user").id, c.req.valid("json"));
  if (profile?.error) return c.json({ error: profile.error, code: profile.code, detail: profile.detail }, profile.statusCode || 409);
  return profile ? c.json({ user: publicUser(profile) }) : c.json({ error: "User not found" }, 404);
});
app.post("/api/personalization/saved-views", writeAccess, zValidator("json", savedViewSchema), async (c) => c.json({ savedView: await upsertSavedView(c.env, accountId(c), c.get("user").id, c.req.valid("json")) }, 201));
app.delete("/api/personalization/saved-views/:id", writeAccess, async (c) => {
  const savedView = await deleteSavedView(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  return savedView ? c.json({ deleted: true, savedView }) : c.json({ error: "Saved view not found" }, 404);
});
app.post("/api/security/password", writeAccess, zValidator("json", changePasswordSchema), async (c) => changePassword(c.env, accountId(c), c.get("user"), c.req.valid("json")));
app.get("/api/security/sessions", async (c) => listActiveSessions(c.env, accountId(c), c.get("user").id));
app.delete("/api/security/sessions/:id", writeAccess, async (c) => revokeSession(c.env, accountId(c), c.get("user").id, c.req.param("id")));
app.get("/api/admin/users", adminAccess, async (c) => listAccountUsers(c.env, accountId(c)));
app.post("/api/admin/invites", adminAccess, zValidator("json", createInviteSchema), async (c) => createInvite(c.env, c.req.raw, accountId(c), c.get("user").id, c.req.valid("json")));
app.patch("/api/admin/users/:id", adminAccess, zValidator("json", updateUserAdminSchema), async (c) => updateAccountUser(c.env, accountId(c), c.get("user").id, c.req.param("id"), c.req.valid("json")));
app.get("/api/admin/audit", adminAccess, zValidator("query", auditQuerySchema), async (c) => c.json({ events: await listAuditEvents(c.env, accountId(c), c.req.valid("query")) }));
app.get("/api/admin/provider-queue", adminAccess, zValidator("query", providerQueueQuerySchema), async (c) => c.json({ items: await listProviderQueue(c.env, accountId(c), c.req.valid("query")) }));
app.get("/api/admin/file-retention", adminAccess, async (c) => c.json({ policy: await getFileRetentionPolicy(c.env, accountId(c)) }));
app.put("/api/admin/file-retention", adminAccess, zValidator("json", fileRetentionPolicySchema), async (c) => c.json({ policy: await updateFileRetentionPolicy(c.env, accountId(c), c.get("user").id, c.req.valid("json")) }));
app.post("/api/admin/file-retention/run", adminAccess, zValidator("json", fileRetentionRunSchema), async (c) => c.json(await runFileRetentionCleanup(c.env, accountId(c), c.get("user").id, c.req.valid("json"))));
app.get("/api/admin/ai-prompts", adminAccess, async (c) => c.json({ prompts: listAiPromptRegistry() }));
app.get("/api/admin/ai-usage", adminAccess, async (c) => c.json({ usage: await getAiUsageReport(c.env, accountId(c)) }));

app.get("/api/notifications", zValidator("query", notificationQuerySchema), async (c) => c.json(await listNotifications(c.env, accountId(c), c.get("user").id, c.req.valid("query"))));
app.patch("/api/notifications/:id", writeAccess, zValidator("json", notificationSchema), async (c) => {
  const notification = await markNotificationRead(c.env, accountId(c), c.get("user").id, c.req.param("id"), c.req.valid("json").status);
  return notification ? c.json({ notification }) : c.json({ error: "Notification not found" }, 404);
});
app.post("/api/notifications/mark-all-read", writeAccess, async (c) => c.json(await markAllNotificationsRead(c.env, accountId(c), c.get("user").id)));
app.delete("/api/notifications/:id", writeAccess, async (c) => {
  const notification = await dismissNotification(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  return notification ? c.json({ notification }) : c.json({ error: "Notification not found" }, 404);
});

app.get("/api/integrations", async (c) => c.json({ integrations: await listIntegrations(c.env, accountId(c)) }));
app.post("/api/integrations", adminAccess, zValidator("json", integrationSchema), async (c) => c.json({ integration: await upsertIntegration(c.env, accountId(c), c.get("user").id, c.req.valid("json").provider) }, 201));
app.get("/api/integrations/google-calendar/status", async (c) => c.json(await getGoogleCalendarStatus(c.env, accountId(c))));
app.get("/api/integrations/google-calendar/connect", async (c) => {
  try {
    const origin = new URL(c.req.url).origin;
    return c.redirect(await createGoogleCalendarAuthUrl(c.env, accountId(c), c.get("user").id, origin));
  } catch (error) {
    return c.redirect(`/?calendar=error&reason=${encodeURIComponent(error.message)}`);
  }
});
app.get("/api/integrations/google-calendar/callback", async (c) => {
  const url = new URL(c.req.url);
  if (url.searchParams.get("error")) return c.redirect(`/?calendar=error&reason=${encodeURIComponent(url.searchParams.get("error"))}`);
  try {
    await completeGoogleCalendarOAuth(c.env, url.searchParams.get("code"), url.searchParams.get("state"));
    return c.redirect("/?calendar=connected");
  } catch (error) {
    const failure = describeGoogleCalendarFailure(c.env, error);
    const params = new URLSearchParams({ calendar: "error", reason: failure.message });
    if (failure.actionLabel) params.set("actionLabel", failure.actionLabel);
    if (failure.actionUrl) params.set("actionUrl", failure.actionUrl);
    return c.redirect(`/?${params}`);
  }
});

app.get("/api/chat/config", async (c) => c.json(assistantConfig(c.env)));
app.get("/api/chat/sessions", zValidator("query", chatSessionQuerySchema), async (c) => {
  const access = assistantAccess(c.env, c.req.valid("query").scope || "inquiry");
  if (access) return c.json(access.body, access.status);
  return c.json({ sessions: await listChatSessions(c.env, accountId(c), c.get("user").id, c.req.valid("query")) });
});
app.post("/api/chat/sessions", writeAccess, zValidator("json", chatSessionSchema), async (c) => {
  const payload = c.req.valid("json");
  const access = assistantAccess(c.env, payload.scope);
  if (access) return c.json(access.body, access.status);
  const session = await createChatSession(c.env, accountId(c), c.get("user").id, payload);
  return session ? c.json({ session }, 201) : c.json({ error: "Inquiry not found" }, 404);
});
app.get("/api/chat/sessions/:id/messages", async (c) => {
  const access = assistantAccess(c.env);
  if (access) return c.json(access.body, access.status);
  const result = await listChatMessages(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  const sessionAccess = result?.session ? assistantAccess(c.env, result.session.scope) : null;
  if (sessionAccess) return c.json(sessionAccess.body, sessionAccess.status);
  return result ? c.json(result) : c.json({ error: "Chat session not found" }, 404);
});
app.post("/api/chat/sessions/:id/messages", writeAccess, zValidator("json", chatMessageSchema), async (c) => {
  const rateLimit = checkChatRateLimit(accountId(c), c.get("user").id, "message", 20, 60_000);
  if (!rateLimit.ok) return c.json({ error: "Assistant rate limit reached. Try again in a minute.", retryAfterMs: rateLimit.retryAfterMs }, 429);
  const payload = c.req.valid("json");
  const access = assistantAccess(c.env, payload.scope || "inquiry");
  if (access) return c.json(access.body, access.status);
  const session = await ensureChatSession(c.env, accountId(c), c.get("user").id, c.req.param("id") === "new" ? null : c.req.param("id"), payload);
  if (!session) return c.json({ error: "Chat session not found" }, 404);
  const sessionAccess = assistantAccess(c.env, session.scope);
  if (sessionAccess) return c.json(sessionAccess.body, sessionAccess.status);
  const context = await buildChatContext(c.env, accountId(c), c.get("user"), session, payload);
  if (!context) return c.json({ error: "Inquiry not found" }, 404);
  const userMessage = await createChatMessage(c.env, accountId(c), session, "user", payload.message, c.get("user").id, { responseMode: payload.responseMode, selectedSourceIds: payload.selectedSourceIds, uploadedChatFileIds: payload.uploadedChatFileIds });
  const analysis = await generateAssistantResponse(c.env, { message: payload.message, responseMode: payload.responseMode, context });
  const response = analysis.response;
  const aiRun = await recordAiRun(c.env, accountId(c), session.inquiryId || null, c.get("user").id, {
    runType: "chat_assistant",
    provider: analysis.mode === "live" ? "openai" : "local",
    modelName: analysis.model,
    promptVersionId: analysis.promptVersionId,
    status: analysis.mode === "live" ? "success" : "fallback",
    inputPreview: payload.message,
    output: response,
    errorMessage: analysis.error || null,
    latencyMs: analysis.latencyMs || null
  });
  const assistantMessage = await createChatMessage(c.env, accountId(c), session, "assistant", response.answer, c.get("user").id, { ...response, mode: analysis.mode, model: analysis.model, promptVersionId: analysis.promptVersionId, aiRunId: aiRun.id, fallback: analysis.mode !== "live", error: analysis.error || null });
  const sources = await createChatSources(c.env, assistantMessage.id, response.sources);
  await createActivity(c.env, accountId(c), session.inquiryId || null, c.get("user").id, "chat.assistant_answered", `Assistant answered ${session.scope} chat`, { sessionId: session.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id, aiRunId: aiRun.id, sourceCount: sources.length });
  return c.json({ session, userMessage, assistantMessage: { ...assistantMessage, sources }, answer: response.answer, sources, confidence: response.confidence, unknowns: response.unknowns, proposedActions: response.proposedActions, riskNotes: response.riskNotes, metadata: { mode: analysis.mode, model: analysis.model, promptVersionId: analysis.promptVersionId, aiRunId: aiRun.id, fallback: analysis.mode !== "live", error: analysis.error || null } }, 201);
});
app.get("/api/chat/sessions/:id/files", async (c) => {
  const access = assistantAccess(c.env);
  if (access) return c.json(access.body, access.status);
  const files = await listChatFilesForSession(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  const session = await getChatSession(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  const sessionAccess = session ? assistantAccess(c.env, session.scope) : null;
  if (sessionAccess) return c.json(sessionAccess.body, sessionAccess.status);
  return files ? c.json({ files }) : c.json({ error: "Chat session not found" }, 404);
});
app.post("/api/chat/sessions/:id/files", writeAccess, async (c) => {
  const rateLimit = checkChatRateLimit(accountId(c), c.get("user").id, "upload", 8, 60_000);
  if (!rateLimit.ok) return c.json({ error: "Assistant upload rate limit reached. Try again in a minute.", retryAfterMs: rateLimit.retryAfterMs }, 429);
  const access = assistantAccess(c.env);
  if (access) return c.json(access.body, access.status);
  if (!c.env?.FILES) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  const session = await getChatSession(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  if (!session) return c.json({ error: "Chat session not found" }, 404);
  const sessionAccess = assistantAccess(c.env, session.scope);
  if (sessionAccess) return c.json(sessionAccess.body, sessionAccess.status);
  const form = await c.req.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) return c.json({ error: "Missing file upload." }, 400);
  if (upload.size > MAX_UPLOAD_BYTES) return c.json({ error: "File is too large. Maximum upload is 12 MB." }, 413);
  if (upload.size <= 0) return c.json({ error: "File is empty." }, 400);
  const category = normalizeFileCategory(form.get("category"));
  const fileName = safeFileName(upload.name || "upload.bin");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const inspection = inspectUpload({ fileName, declaredType: upload.type || "", bytes, category });
  if (!inspection.ok) return c.json({ error: inspection.error }, 415);
  const contentHash = await sha256Hex(bytes);
  const storageKey = `accounts/${accountId(c)}/chat/${session.id}/${crypto.randomUUID()}-${fileName}`;
  await c.env.FILES.put(storageKey, bytes, { httpMetadata: { contentType: inspection.contentType }, customMetadata: { accountId: accountId(c), sessionId: session.id, inquiryId: session.inquiryId || "", fileName, category, declaredType: upload.type || "", contentHash } });
  const extraction = extractChatUploadText(bytes, inspection.contentType, fileName);
  let fileId = null;
  const linkToInquiry = session.scope === "inquiry" && form.get("linkToInquiry") !== "false";
  if (linkToInquiry) {
    const thumbnail = await storeFileThumbnail(c.env, accountId(c), session.inquiryId, fileName, inspection.contentType, category);
    const persisted = await createFileRecord(c.env, accountId(c), session.inquiryId, c.get("user").id, { fileName, contentType: inspection.contentType, storageKey, sizeBytes: bytes.byteLength, contentHash, category, ...thumbnail });
    fileId = persisted?.id || null;
  }
  const chatFile = await createChatFileRecord(c.env, accountId(c), session, c.get("user").id, { fileId, storageKey, fileName, contentType: inspection.contentType, sizeBytes: bytes.byteLength, contentHash, extractedText: extraction.text, extractionStatus: extraction.status, retentionExpiresAt: chatUploadRetentionExpiresAt(c.env, Boolean(fileId)) });
  await createActivity(c.env, accountId(c), session.inquiryId || null, c.get("user").id, "chat.file_uploaded", `Uploaded ${fileName} to assistant chat`, { sessionId: session.id, chatFileId: chatFile.id, fileId, extractionStatus: extraction.status, category });
  return c.json({ file: chatFile, linkedFileId: fileId }, 201);
});
app.post("/api/chat/sessions/:id/actions/save-note", writeAccess, zValidator("json", chatSaveNoteSchema), async (c) => {
  const access = assistantAccess(c.env);
  if (access) return c.json(access.body, access.status);
  const session = await getChatSession(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  if (!session) return c.json({ error: "Chat session not found" }, 404);
  const sessionAccess = assistantAccess(c.env, session.scope);
  if (sessionAccess) return c.json(sessionAccess.body, sessionAccess.status);
  const payload = c.req.valid("json");
  const inquiryId = payload.inquiryId || session.inquiryId;
  if (!inquiryId) return c.json({ error: "Saving a note requires an inquiry-scoped chat or inquiryId." }, 400);
  const message = payload.messageId ? await getChatMessage(c.env, accountId(c), c.get("user").id, session.id, payload.messageId) : null;
  const body = String(payload.body || message?.body || "").trim();
  const comment = await createInquiryComment(c.env, accountId(c), inquiryId, c.get("user").id, { body: `Assistant note:\n\n${body}` });
  if (comment?.error) return c.json({ error: comment.error }, comment.statusCode || 400);
  return comment ? c.json({ comment }, 201) : c.json({ error: "Inquiry not found" }, 404);
});
app.post("/api/chat/sessions/:id/actions/create-draft", writeAccess, zValidator("json", chatCreateDraftSchema), async (c) => {
  const access = assistantAccess(c.env);
  if (access) return c.json(access.body, access.status);
  const session = await getChatSession(c.env, accountId(c), c.get("user").id, c.req.param("id"));
  if (!session) return c.json({ error: "Chat session not found" }, 404);
  const sessionAccess = assistantAccess(c.env, session.scope);
  if (sessionAccess) return c.json(sessionAccess.body, sessionAccess.status);
  const payload = c.req.valid("json");
  const inquiryId = payload.inquiryId || session.inquiryId;
  if (!inquiryId) return c.json({ error: "Creating a draft requires an inquiry-scoped chat or inquiryId." }, 400);
  const message = payload.messageId ? await getChatMessage(c.env, accountId(c), c.get("user").id, session.id, payload.messageId) : null;
  const body = String(payload.body || message?.body || "").trim();
  const document = await saveDocumentDraft(c.env, accountId(c), inquiryId, c.get("user").id, { documentType: payload.documentType, title: payload.title || "Assistant Draft", subject: payload.subject || null, body, status: "draft", metadata: { source: "chat_assistant", sessionId: session.id, messageId: message?.id || null } });
  if (document?.error) return c.json({ error: document.error, code: document.code, detail: document.detail }, document.statusCode || 409);
  return document ? c.json({ document }, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.get("/api/inquiries", zValidator("query", inquiryListQuerySchema), async (c) => c.json(await listInquiries(c.env, accountId(c), c.req.valid("query"))));
app.post("/api/inquiries", writeAccess, async (c) => c.json(await createInquiry(c.env, accountId(c), c.get("user").id, await c.req.json()), 201));

app.post("/api/ai/intake-preview", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  await recordAiRun(c.env, accountId(c), null, c.get("user").id, { runType: "intake_extraction", provider: analysis.mode === "live" ? "openai" : "local", modelName: analysis.model, promptVersionId: analysis.promptVersionId, status: analysis.mode === "live" ? "success" : "fallback", inputPreview: payload.rawText, output: analysis.extraction, errorMessage: analysis.error || null, latencyMs: analysis.latencyMs || null });
  return c.json({ mode: analysis.mode, model: analysis.model, promptVersionId: analysis.promptVersionId, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) });
});

app.post("/api/inquiries/from-source", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  const saved = await createInquiryFromExtraction(c.env, accountId(c), c.get("user").id, payload, analysis);
  return c.json({ ...saved, mode: analysis.mode, model: analysis.model, promptVersionId: analysis.promptVersionId, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) }, 201);
});

app.post("/api/intake/inbound", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  const saved = await createInquiryFromExtraction(c.env, accountId(c), c.get("user").id, { subject: `${payload.sourceChannel} intake`, sender: "External intake", ...payload }, analysis);
  return c.json({ ...saved, accepted: true, mode: analysis.mode, model: analysis.model, promptVersionId: analysis.promptVersionId, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) }, 202);
});

app.get("/api/inquiries/:id", async (c) => {
  const detail = await getInquiryDetail(c.env, accountId(c), c.req.param("id"), c.get("user").id);
  if (detail) await recordRecentItem(c.env, c.get("user").id, "inquiry", c.req.param("id"), {
    title: detail.inquiry.title,
    companyName: detail.inquiry.company_name,
    status: detail.inquiry.status,
    screen: "detail"
  });
  return detail ? c.json(detail) : c.json({ error: "Inquiry not found" }, 404);
});
app.get("/api/inquiries/:id/watchers", async (c) => {
  const watchers = await listInquiryWatchers(c.env, accountId(c), c.req.param("id"), c.get("user").id);
  return c.json(watchers);
});
app.post("/api/inquiries/:id/watchers", writeAccess, async (c) => {
  const watchers = await watchInquiry(c.env, accountId(c), c.req.param("id"), c.get("user").id);
  return watchers ? c.json(watchers, 201) : c.json({ error: "Inquiry not found" }, 404);
});
app.delete("/api/inquiries/:id/watchers/me", writeAccess, async (c) => {
  const watchers = await unwatchInquiry(c.env, accountId(c), c.req.param("id"), c.get("user").id);
  return watchers ? c.json(watchers) : c.json({ error: "Inquiry not found" }, 404);
});
app.delete("/api/inquiries/:id", writeAccess, async (c) => {
  const deleted = await deleteInquiry(c.env, accountId(c), c.req.param("id"));
  return deleted ? c.json({ deleted: true, inquiry: deleted }) : c.json({ error: "Inquiry not found" }, 404);
});
app.post("/api/inquiries/:id/activity", writeAccess, zValidator("json", activitySchema), async (c) => { const payload = c.req.valid("json"); return c.json(await createActivity(c.env, accountId(c), c.req.param("id"), c.get("user").id, payload.eventType, payload.summary, payload.metadata), 201); });
app.patch("/api/inquiries/:id/details", writeAccess, zValidator("json", detailsSchema), async (c) => {
  const details = await updateInquiryDetails(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  if (details?.error) return c.json({ error: details.error, code: details.code, detail: details.detail }, details.statusCode || 409);
  return details ? c.json({ details }) : c.json({ error: "Inquiry not found" }, 404);
});
app.patch("/api/inquiries/:id/owner", adminAccess, zValidator("json", assignmentSchema), async (c) => {
  const payload = c.req.valid("json");
  const result = await updateInquiryOwner(c.env, accountId(c), c.req.param("id"), c.get("user").id, payload.ownerUserId, payload);
  if (result?.error) return c.json({ error: result.error, code: result.code, detail: result.detail }, result.statusCode || 400);
  return result ? c.json({ inquiry: result }) : c.json({ error: "Inquiry not found" }, 404);
});

app.post("/api/inquiries/:id/generate", writeAccess, zValidator("json", generateSchema), async (c) => {
  const payload = c.req.valid("json");
  const detail = await getInquiryDetail(c.env, accountId(c), c.req.param("id"));
  if (!detail) return c.json({ error: "Inquiry not found" }, 404);
  const analysis = await generateWorkProduct(c.env, { ...payload, inquiry: detail.inquiry, fields: detail.fields, missing: detail.missing, summaries: detail.summaries, documents: detail.documents, files: detail.files });
  const saved = await createGeneratedWorkProduct(c.env, accountId(c), c.req.param("id"), c.get("user").id, payload.type, analysis);
  return c.json({ ...saved, mode: analysis.mode, model: analysis.model, promptVersionId: analysis.promptVersionId, error: analysis.error || null }, 201);
});

app.post("/api/inquiries/:id/documents", writeAccess, zValidator("json", documentSchema), async (c) => {
  const id = c.req.param("id");
  if (!await getInquiryDetail(c.env, accountId(c), id)) return c.json({ error: "Inquiry not found" }, 404);
  const document = await saveDocumentDraft(c.env, accountId(c), id, c.get("user").id, c.req.valid("json"));
  if (document?.error) return c.json({ error: document.error, code: document.code, detail: document.detail }, document.statusCode || 409);
  return c.json({ document }, 201);
});

app.get("/api/inquiries/:id/communications", async (c) => c.json({ communications: await listCommunications(c.env, accountId(c), c.req.param("id")) }));
app.post("/api/inquiries/:id/communications", writeAccess, zValidator("json", communicationSchema), async (c) => {
  const communication = await logCommunication(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return communication ? c.json({ communication }, 201) : c.json({ error: "Inquiry not found" }, 404);
});
app.get("/api/inquiries/:id/comments", async (c) => c.json({ comments: await listInquiryComments(c.env, accountId(c), c.req.param("id")) }));
app.post("/api/inquiries/:id/comments", writeAccess, zValidator("json", commentSchema), async (c) => {
  const comment = await createInquiryComment(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  if (comment?.error) return c.json({ error: comment.error }, comment.statusCode || 400);
  return comment ? c.json({ comment }, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.post("/api/inquiries/:id/send-follow-up", writeAccess, zValidator("json", followUpSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const detail = await getInquiryDetail(c.env, accountId(c), id);
  if (!detail) return c.json({ error: "Inquiry not found" }, 404);
  const document = await saveDocumentDraft(c.env, accountId(c), id, c.get("user").id, { documentId: payload.documentId, documentType: "follow_up_email", title: payload.title || `Follow-up Email - ${detail.inquiry.title}`, subject: payload.subject, body: payload.body, status: "draft", metadata: { ...payload.metadata, queuedForDelivery: true }, expectedVersion: payload.expectedVersion, expectedUpdatedAt: payload.expectedUpdatedAt });
  if (document?.error) return c.json({ error: document.error, code: document.code, detail: document.detail }, document.statusCode || 409);
  const result = await sendOutboundCommunication(c.env, accountId(c), id, c.get("user").id, { channel: payload.channel, subject: payload.subject, body: payload.body, metadata: { ...payload.metadata, documentId: document.documentId, documentVersionId: document.versionId } });
  return c.json({ ...result, document }, result?.communication?.status === "sent" ? 200 : 202);
});

app.post("/api/inquiries/:id/proposal-review", writeAccess, zValidator("json", reviewSchema), async (c) => {
  const result = await submitProposalForReview(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  if (result?.error) return c.json({ error: result.error, code: result.code, detail: result.detail }, result.statusCode || 409);
  return result ? c.json(result) : c.json({ error: "Proposal draft not found" }, 404);
});

app.post("/api/inquiries/:id/estimate", writeAccess, zValidator("json", estimateSchema), async (c) => {
  const result = await saveEstimateForInquiry(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return result ? c.json(result, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.get("/api/inquiries/:id/files", async (c) => c.json({ files: await listFilesForInquiry(c.env, accountId(c), c.req.param("id")) }));
app.post("/api/inquiries/:id/files", writeAccess, async (c) => {
  if (!c.env?.FILES) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  const id = c.req.param("id");
  if (!await getInquiryDetail(c.env, accountId(c), id)) return c.json({ error: "Inquiry not found" }, 404);
  const form = await c.req.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) return c.json({ error: "Missing file upload." }, 400);
  if (upload.size > MAX_UPLOAD_BYTES) return c.json({ error: "File is too large. Maximum upload is 12 MB." }, 413);
  if (upload.size <= 0) return c.json({ error: "File is empty." }, 400);
  const category = normalizeFileCategory(form.get("category"));
  const fileName = safeFileName(upload.name || "upload.bin");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const inspection = inspectUpload({ fileName, declaredType: upload.type || "", bytes, category });
  if (!inspection.ok) return c.json({ error: inspection.error }, 415);
  const contentHash = await sha256Hex(bytes);
  const duplicate = await getFileByContentHash(c.env, accountId(c), id, contentHash);
  if (duplicate) return c.json({ file: publicFile({ ...duplicate, duplicate: true }), duplicate: true });
  const storageKey = `accounts/${accountId(c)}/inquiries/${id}/${crypto.randomUUID()}-${fileName}`;
  await c.env.FILES.put(storageKey, bytes, { httpMetadata: { contentType: inspection.contentType }, customMetadata: { accountId: accountId(c), inquiryId: id, fileName, category, declaredType: upload.type || "", contentHash } });
  const thumbnail = await storeFileThumbnail(c.env, accountId(c), id, fileName, inspection.contentType, category);
  const record = await createFileRecord(c.env, accountId(c), id, c.get("user").id, { fileName, contentType: inspection.contentType, storageKey, sizeBytes: bytes.byteLength, contentHash, category, ...thumbnail });
  return c.json({ file: publicFile(record) }, 201);
});

app.get("/api/files/:id/thumbnail", async (c) => {
  if (!c.env?.FILES) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  const file = await getFileForDownload(c.env, accountId(c), c.req.param("id"));
  if (!file) return c.json({ error: "File not found" }, 404);
  if (file.thumbnail_status !== "generated" || !file.thumbnail_storage_key) return c.json({ error: "Thumbnail is not available for this file." }, 404);
  const object = await c.env.FILES.get(file.thumbnail_storage_key);
  if (!object) return c.json({ error: "Stored thumbnail object not found" }, 404);
  return new Response(object.body, { headers: fileThumbnailHeaders(file, object) });
});

app.get("/api/files/:id", async (c) => {
  if (!c.env?.FILES) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  let file = await getFileForDownload(c.env, accountId(c), c.req.param("id"));
  if (!file) return c.json({ error: "File not found" }, 404);
  let object = await c.env.FILES.get(file.storage_key);
  if (!object) {
    file = await rebuildDocumentExportObject(c.env, file.id, accountId(c)) || file;
    object = await c.env.FILES.get(file.storage_key);
  }
  if (!object) return c.json({ error: "Stored file object not found" }, 404);
  return new Response(object.body, { headers: fileDownloadHeaders(file, object) });
});
app.get("/api/files/:id/share-links", async (c) => {
  const file = await getFileForDownload(c.env, accountId(c), c.req.param("id"));
  if (!file) return c.json({ error: "File not found" }, 404);
  return c.json({ shareLinks: await listFileShareLinks(c.env, accountId(c), c.req.param("id")) });
});
app.post("/api/files/:id/share-links", writeAccess, zValidator("json", fileShareSchema), async (c) => {
  const shareLink = await createFileShareLink(c.env, accountId(c), c.req.param("id"), c.get("user").id, new URL(c.req.url).origin, c.req.valid("json"));
  return shareLink ? c.json({ shareLink }, 201) : c.json({ error: "File not found" }, 404);
});
app.delete("/api/file-share-links/:id", writeAccess, async (c) => {
  const shareLink = await revokeFileShareLink(c.env, accountId(c), c.req.param("id"), c.get("user").id);
  return shareLink ? c.json({ shareLink }) : c.json({ error: "Share link not found" }, 404);
});
app.delete("/api/files/:id", writeAccess, async (c) => {
  if (!c.env?.FILES?.delete) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  const deleted = await deleteFileRecord(c.env, accountId(c), c.req.param("id"), c.get("user").id);
  return deleted ? c.json({ deleted: true, file: deleted }) : c.json({ error: "File not found" }, 404);
});

app.get("/api/inquiries/:id/site-visits", async (c) => c.json({ siteVisits: await listSiteVisits(c.env, accountId(c), c.req.param("id")) }));
app.post("/api/inquiries/:id/site-visits", writeAccess, zValidator("json", siteVisitSchema), async (c) => {
  const result = await scheduleSiteVisit(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return result ? c.json(result, 201) : c.json({ error: "Inquiry not found" }, 404);
});
app.patch("/api/inquiries/:id/status", writeAccess, zValidator("json", statusSchema), async (c) => {
  const payload = c.req.valid("json");
  const result = await updateInquiryStatus(c.env, accountId(c), c.req.param("id"), c.get("user").id, payload.status, payload);
  if (result?.error) return c.json({ error: result.error, code: result.code, detail: result.detail, allowed: result.allowed }, result.statusCode || 409);
  return result ? c.json({ inquiry: result }) : c.json({ error: "Inquiry not found" }, 404);
});
app.patch("/api/missing-requirements/:id", writeAccess, zValidator("json", requirementSchema), async (c) => {
  const result = await updateMissingRequirement(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json").status);
  return result ? c.json({ requirement: result }) : c.json({ error: "Requirement not found" }, 404);
});
app.patch("/api/checklist-items/:id", writeAccess, zValidator("json", checklistSchema), async (c) => {
  const payload = c.req.valid("json");
  const result = await updateChecklistItem(c.env, accountId(c), c.req.param("id"), c.get("user").id, payload.status, payload.notes || null);
  return result ? c.json({ checklistItem: result }) : c.json({ error: "Checklist item not found" }, 404);
});
app.post("/api/inquiries/:id/sync", writeAccess, zValidator("json", syncSchema), async (c) => {
  const result = await syncInquiry(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json").provider);
  return result ? c.json({ sync: result }, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError(async (error, c) => {
  try {
    const user = c.get("user");
    const account = c.get("accountId");
    if (user?.id && account) await createNotification(c.env, account, user.id, {
      type: "system_error",
      title: "Action failed",
      message: error.message || "An unexpected server error occurred.",
      severity: "error",
      actionLabel: "Review workspace",
      actionRoute: "today",
      dedupeKey: `system_error:${new URL(c.req.url).pathname}:${String(error.message || "unexpected").slice(0, 80)}`,
      metadata: { path: new URL(c.req.url).pathname }
    });
  } catch {}
  return c.json({ error: "Unexpected server error", detail: error.message }, 500);
});

async function writeAccess(c, next) { const guard = await requireWriteAccess(c.env, accountId(c), c.get("user")); if (guard) return guard; await next(); }
async function adminAccess(c, next) { const guard = await requireAdminAccess(c.env, accountId(c), c.get("user")); if (guard) return guard; await next(); }
function accountId(c) { return c.get("accountId"); }
function assistantConfig(env) {
  return {
    enabled: env?.ASSISTANT_ENABLED !== "false",
    workspaceEnabled: env?.ASSISTANT_WORKSPACE_ENABLED !== "false",
    maxUploadBytes: MAX_UPLOAD_BYTES,
    chatUploadRetentionDays: chatUploadRetentionDays(env),
    provider: env?.OPENAI_API_KEY ? "openai" : "local",
    model: env?.OPENAI_MODEL || "gpt-5.5"
  };
}
function chatUploadRetentionDays(env) {
  const value = Number(env?.CHAT_FILE_RETENTION_DAYS || 30);
  return Number.isFinite(value) && value >= 1 && value <= 3650 ? Math.round(value) : 30;
}
function chatUploadRetentionExpiresAt(env, linkedToInquiry) {
  if (linkedToInquiry) return null;
  return new Date(Date.now() + chatUploadRetentionDays(env) * 86_400_000).toISOString();
}
function assistantAccess(env, scope = null) {
  const config = assistantConfig(env);
  if (!config.enabled) return { status: 503, body: { error: "Assistant is disabled for this environment.", code: "assistant_disabled" } };
  if (scope === "workspace" && !config.workspaceEnabled) return { status: 403, body: { error: "Workspace assistant is disabled for this environment.", code: "workspace_assistant_disabled" } };
  return null;
}
function checkChatRateLimit(accountId, userId, kind, max, windowMs) {
  const nowMs = Date.now();
  const key = `${accountId}:${userId}:${kind}`;
  const current = (chatRateLimits.get(key) || []).filter((time) => nowMs - time < windowMs);
  if (current.length >= max) return { ok: false, retryAfterMs: Math.max(1000, windowMs - (nowMs - current[0])) };
  current.push(nowMs);
  chatRateLimits.set(key, current);
  if (chatRateLimits.size > 500) {
    for (const [entryKey, values] of chatRateLimits) {
      const kept = values.filter((time) => nowMs - time < windowMs);
      if (kept.length) chatRateLimits.set(entryKey, kept);
      else chatRateLimits.delete(entryKey);
    }
  }
  return { ok: true, retryAfterMs: 0 };
}
function csrfProtectionFailed(request, env) {
  if (!env.AUTH_SESSION_SECRET || SAFE_METHODS.has(request.method.toUpperCase())) return false;
  const cookieName = env.AUTH_COOKIE_NAME || "dcdcom_session";
  const hasSessionCookie = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).some((part) => part.startsWith(`${cookieName}=`));
  if (!hasSessionCookie) return false;
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== expectedOrigin) return true;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return true;
  const referer = request.headers.get("referer");
  if (!origin && referer) {
    try { return new URL(referer).origin !== expectedOrigin; } catch { return true; }
  }
  return false;
}
function normalizeFileCategory(value) { const category = String(value || "other"); return ["photo", "floor_plan", "equipment_list", "contract", "email_attachment", "document_export", "other"].includes(category) ? category : "other"; }
function safeFileName(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload.bin"; }
function publicFile(file) {
  return {
    id: file.id,
    fileName: file.fileName || file.file_name,
    contentType: file.contentType || file.content_type,
    sizeBytes: file.sizeBytes ?? file.size_bytes,
    contentHash: file.contentHash || file.content_hash || null,
    thumbnailStatus: file.thumbnailStatus || file.thumbnail_status || "pending",
    thumbnailUrl: (file.thumbnailStorageKey || file.thumbnail_storage_key) ? `/api/files/${encodeURIComponent(file.id)}/thumbnail` : null,
    category: file.category,
    duplicate: Boolean(file.duplicate),
    url: `/api/files/${encodeURIComponent(file.id)}`
  };
}
function inspectUpload({ fileName, declaredType, bytes, category }) {
  const extension = fileName.toLowerCase().split(".").pop() || "";
  const detected = detectContentType(bytes, extension);
  const contentType = detected || declaredType || "application/octet-stream";
  const allowed = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    "application/pdf", "text/plain", "text/csv", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]);
  if (!allowed.has(contentType)) return { ok: false, error: "Unsupported file type. Upload images, PDFs, text, CSV, Word, or Excel files." };
  if ((declaredType.startsWith("image/") || imageExtension(extension) || category === "photo") && !detected?.startsWith("image/")) {
    return { ok: false, error: "Image uploads must contain a supported image file signature." };
  }
  if (category === "photo" && !contentType.startsWith("image/")) return { ok: false, error: "Photo uploads must be image files." };
  if (declaredType && allowed.has(declaredType) && detected && declaredType !== detected && !officeExtension(extension)) {
    return { ok: false, error: "The file content does not match its declared type." };
  }
  return { ok: true, contentType };
}
function extractChatUploadText(bytes, contentType, fileName) {
  if (contentType === "text/plain" || contentType === "text/csv") {
    try {
      return { status: "complete", text: new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, 24_000) };
    } catch {
      return { status: "failed", text: "" };
    }
  }
  if (String(contentType || "").startsWith("image/")) {
    return { status: "metadata_only", text: `${fileName} is an uploaded image. Visual analysis requires the configured AI provider and should be reviewed against the source file.` };
  }
  if (contentType === "application/pdf") {
    return { status: "metadata_only", text: `${fileName} is an uploaded PDF. Text extraction is queued for a Worker-compatible parser; use the file metadata as preliminary evidence.` };
  }
  if (String(contentType || "").includes("word") || String(contentType || "").includes("spreadsheet") || contentType === "application/msword") {
    return { status: "unsupported", text: `${fileName} was stored, but text extraction is not available for this document type in the current runtime.` };
  }
  return { status: "unsupported", text: "" };
}
function detectContentType(bytes, extension) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "%PDF") return "application/pdf";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 12).includes("ftypheic")) return "image/heic";
  if (ascii(bytes, 4, 12).includes("ftypheif")) return "image/heif";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "doc") return "application/msword";
  if (["txt", "csv"].includes(extension) && looksText(bytes)) return extension === "csv" ? "text/csv" : "text/plain";
  return null;
}
function fileDownloadHeaders(file, object) {
  const contentType = file.content_type || "application/octet-stream";
  const inline = contentType.startsWith("image/") || contentType === "application/pdf" || contentType.startsWith("text/");
  const name = file.file_name.replace(/["\r\n]/g, "");
  const encoded = encodeURIComponent(name);
  return {
    "content-type": contentType,
    "content-length": String(file.size_bytes || object.size || 0),
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encoded}`,
    "content-security-policy": "sandbox",
    "x-content-type-options": "nosniff",
    ...(file.content_hash ? { "x-content-sha256": file.content_hash } : {}),
    "cache-control": "private, no-store"
  };
}
function fileThumbnailHeaders(file, object) {
  return {
    "content-type": file.thumbnail_content_type || "image/svg+xml",
    "content-length": String(object.size || 0),
    "content-security-policy": "sandbox",
    "x-content-type-options": "nosniff",
    ...(file.content_hash ? { "x-source-content-sha256": file.content_hash } : {}),
    "cache-control": "private, max-age=300"
  };
}
function startsWith(bytes, prefix) { return prefix.every((value, index) => bytes[index] === value); }
function ascii(bytes, start, end) { return String.fromCharCode(...bytes.slice(start, end)); }
function officeExtension(extension) { return ["docx", "xlsx"].includes(extension); }
function imageExtension(extension) { return ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension); }
function looksText(bytes) {
  const sample = bytes.slice(0, Math.min(bytes.length, 512));
  return sample.every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127));
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
