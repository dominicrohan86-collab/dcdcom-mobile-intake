import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { zValidator } from "@hono/zod-validator";
import { analyzeIntake, extractionToPreview, generateWorkProduct } from "./ai.js";
import { authenticateRequest, requireAdminAccess, requireWriteAccess } from "./auth.js";
import { ensureDatabase } from "./db.js";
import { ensureBootstrap, publicUser, readinessReport } from "./bootstrap.js";
import { completeGoogleCalendarOAuth, createGoogleCalendarAuthUrl, describeGoogleCalendarFailure, getGoogleCalendarEvents, getGoogleCalendarStatus } from "./google-calendar.js";
import { createRequestTelemetry } from "./observability.js";
import { activitySchema, checklistSchema, communicationSchema, detailsSchema, documentSchema, estimateSchema, followUpSchema, generateSchema, inquiryListQuerySchema, intakeSchema, integrationSchema, profileSchema, requirementSchema, reviewSchema, settingsSchema, siteVisitSchema, statusSchema, syncSchema, todayQuerySchema } from "./contracts.js";
import { createActivity, createFileRecord, createGeneratedWorkProduct, createInquiry, createInquiryFromExtraction, deleteInquiry, getFileForDownload, getInquiryDetail, getTodayWorkspace, getUserPreferences, listCommunications, listFilesForInquiry, listInquiries, listIntegrations, listSiteVisits, logCommunication, recordAiRun, saveDocumentDraft, saveEstimateForInquiry, scheduleSiteVisit, sendOutboundCommunication, submitProposalForReview, syncInquiry, updateChecklistItem, updateInquiryDetails, updateInquiryStatus, updateMissingRequirement, updateUserPreferences, updateUserProfile, upsertIntegration } from "./repository.js";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const app = new Hono();

app.use("/api/*", secureHeaders());
app.use("/api/*", async (c, next) => {
  if (!c.env?.DB) return c.json({ ok: false, error: "D1 binding DB is not configured in this environment.", expectedBinding: "DB" }, 503);
  await ensureDatabase(c.env);
  const context = await authenticateRequest(c.env, c.req.raw);
  if (context.response) return context.response;
  const { user, accountId } = context;
  c.set("user", user);
  c.set("accountId", accountId);
  const telemetry = createRequestTelemetry(c.req.raw, user, accountId);
  await ensureBootstrap(c.env, user, accountId);
  await next();
  c.header("cache-control", "no-store");
  telemetry.finish(c.res);
});

app.get("/api/health", (c) => c.json({ ok: true, database: "D1 via Drizzle", binding: "DB", fileStorage: c.env?.FILES ? "R2" : "not_configured", router: "Hono" }));
app.get("/api/readiness", async (c) => c.json(await readinessReport(c.env, c.get("user"), accountId(c))));
app.get("/api/bootstrap", async (c) => {
  const user = c.get("user");
  const [inquiries, preferences, integrations] = await Promise.all([listInquiries(c.env, accountId(c)), getUserPreferences(c.env, user.id), listIntegrations(c.env, accountId(c))]);
  return c.json({ accountId: accountId(c), user, preferences, integrations, inquiries });
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
app.put("/api/settings", writeAccess, zValidator("json", settingsSchema), async (c) => c.json({ preferences: await updateUserPreferences(c.env, accountId(c), c.get("user").id, c.req.valid("json")) }));
app.patch("/api/profile", writeAccess, zValidator("json", profileSchema), async (c) => {
  const profile = await updateUserProfile(c.env, accountId(c), c.get("user").id, c.req.valid("json"));
  return profile ? c.json({ user: publicUser(profile) }) : c.json({ error: "User not found" }, 404);
});

app.get("/api/integrations", async (c) => c.json({ integrations: await listIntegrations(c.env, accountId(c)) }));
app.post("/api/integrations", adminAccess, zValidator("json", integrationSchema), async (c) => c.json({ integration: await upsertIntegration(c.env, accountId(c), c.get("user").id, c.req.valid("json").provider) }, 201));
app.get("/api/integrations/google-calendar/status", async (c) => c.json(await getGoogleCalendarStatus(c.env, accountId(c))));
app.get("/api/integrations/google-calendar/connect", adminAccess, async (c) => {
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

app.get("/api/inquiries", zValidator("query", inquiryListQuerySchema), async (c) => c.json(await listInquiries(c.env, accountId(c), c.req.valid("query"))));
app.post("/api/inquiries", writeAccess, async (c) => c.json(await createInquiry(c.env, accountId(c), c.get("user").id, await c.req.json()), 201));

app.post("/api/ai/intake-preview", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  await recordAiRun(c.env, accountId(c), null, c.get("user").id, { runType: "intake_extraction", provider: analysis.mode === "live" ? "openai" : "local", modelName: analysis.model, status: analysis.mode === "live" ? "success" : "fallback", inputPreview: payload.rawText, output: analysis.extraction, errorMessage: analysis.error || null, latencyMs: analysis.latencyMs || null });
  return c.json({ mode: analysis.mode, model: analysis.model, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) });
});

app.post("/api/inquiries/from-source", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  const saved = await createInquiryFromExtraction(c.env, accountId(c), c.get("user").id, payload, analysis);
  return c.json({ ...saved, mode: analysis.mode, model: analysis.model, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) }, 201);
});

app.post("/api/intake/inbound", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  const saved = await createInquiryFromExtraction(c.env, accountId(c), c.get("user").id, { subject: `${payload.sourceChannel} intake`, sender: "External intake", ...payload }, analysis);
  return c.json({ ...saved, accepted: true, mode: analysis.mode, model: analysis.model, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) }, 202);
});

app.get("/api/inquiries/:id", async (c) => {
  const detail = await getInquiryDetail(c.env, accountId(c), c.req.param("id"));
  return detail ? c.json(detail) : c.json({ error: "Inquiry not found" }, 404);
});
app.delete("/api/inquiries/:id", writeAccess, async (c) => {
  const deleted = await deleteInquiry(c.env, accountId(c), c.req.param("id"));
  return deleted ? c.json({ deleted: true, inquiry: deleted }) : c.json({ error: "Inquiry not found" }, 404);
});
app.post("/api/inquiries/:id/activity", writeAccess, zValidator("json", activitySchema), async (c) => { const payload = c.req.valid("json"); return c.json(await createActivity(c.env, accountId(c), c.req.param("id"), c.get("user").id, payload.eventType, payload.summary, payload.metadata), 201); });
app.patch("/api/inquiries/:id/details", writeAccess, zValidator("json", detailsSchema), async (c) => {
  const details = await updateInquiryDetails(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return details ? c.json({ details }) : c.json({ error: "Inquiry not found" }, 404);
});

app.post("/api/inquiries/:id/generate", writeAccess, zValidator("json", generateSchema), async (c) => {
  const payload = c.req.valid("json");
  const detail = await getInquiryDetail(c.env, accountId(c), c.req.param("id"));
  if (!detail) return c.json({ error: "Inquiry not found" }, 404);
  const analysis = await generateWorkProduct(c.env, { ...payload, inquiry: detail.inquiry, fields: detail.fields, missing: detail.missing, summaries: detail.summaries, documents: detail.documents });
  const saved = await createGeneratedWorkProduct(c.env, accountId(c), c.req.param("id"), c.get("user").id, payload.type, analysis);
  return c.json({ ...saved, mode: analysis.mode, model: analysis.model, error: analysis.error || null }, 201);
});

app.post("/api/inquiries/:id/documents", writeAccess, zValidator("json", documentSchema), async (c) => {
  const id = c.req.param("id");
  if (!await getInquiryDetail(c.env, accountId(c), id)) return c.json({ error: "Inquiry not found" }, 404);
  return c.json({ document: await saveDocumentDraft(c.env, accountId(c), id, c.get("user").id, c.req.valid("json")) }, 201);
});

app.get("/api/inquiries/:id/communications", async (c) => c.json({ communications: await listCommunications(c.env, accountId(c), c.req.param("id")) }));
app.post("/api/inquiries/:id/communications", writeAccess, zValidator("json", communicationSchema), async (c) => {
  const communication = await logCommunication(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return communication ? c.json({ communication }, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.post("/api/inquiries/:id/send-follow-up", writeAccess, zValidator("json", followUpSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const detail = await getInquiryDetail(c.env, accountId(c), id);
  if (!detail) return c.json({ error: "Inquiry not found" }, 404);
  const document = await saveDocumentDraft(c.env, accountId(c), id, c.get("user").id, { documentId: payload.documentId, documentType: "follow_up_email", title: payload.title || `Follow-up Email - ${detail.inquiry.title}`, subject: payload.subject, body: payload.body, status: "draft", metadata: { ...payload.metadata, queuedForDelivery: true } });
  const result = await sendOutboundCommunication(c.env, accountId(c), id, c.get("user").id, { channel: payload.channel, subject: payload.subject, body: payload.body, metadata: { ...payload.metadata, documentId: document.documentId, documentVersionId: document.versionId } });
  return c.json({ ...result, document }, result?.communication?.status === "sent" ? 200 : 202);
});

app.post("/api/inquiries/:id/proposal-review", writeAccess, zValidator("json", reviewSchema), async (c) => {
  const result = await submitProposalForReview(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
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
  const storageKey = `accounts/${accountId(c)}/inquiries/${id}/${crypto.randomUUID()}-${fileName}`;
  await c.env.FILES.put(storageKey, bytes, { httpMetadata: { contentType: inspection.contentType }, customMetadata: { accountId: accountId(c), inquiryId: id, fileName, category, declaredType: upload.type || "" } });
  const record = await createFileRecord(c.env, accountId(c), id, c.get("user").id, { fileName, contentType: inspection.contentType, storageKey, sizeBytes: bytes.byteLength, category });
  return c.json({ file: publicFile(record) }, 201);
});

app.get("/api/files/:id", async (c) => {
  if (!c.env?.FILES) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  const file = await getFileForDownload(c.env, accountId(c), c.req.param("id"));
  if (!file) return c.json({ error: "File not found" }, 404);
  const object = await c.env.FILES.get(file.storage_key);
  if (!object) return c.json({ error: "Stored file object not found" }, 404);
  return new Response(object.body, { headers: fileDownloadHeaders(file, object) });
});

app.get("/api/inquiries/:id/site-visits", async (c) => c.json({ siteVisits: await listSiteVisits(c.env, accountId(c), c.req.param("id")) }));
app.post("/api/inquiries/:id/site-visits", writeAccess, zValidator("json", siteVisitSchema), async (c) => {
  const result = await scheduleSiteVisit(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return result ? c.json(result, 201) : c.json({ error: "Inquiry not found" }, 404);
});
app.patch("/api/inquiries/:id/status", writeAccess, zValidator("json", statusSchema), async (c) => {
  const result = await updateInquiryStatus(c.env, accountId(c), c.req.param("id"), c.get("user").id, c.req.valid("json").status);
  if (result?.error) return c.json({ error: result.error, allowed: result.allowed }, result.statusCode || 409);
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
app.onError((error, c) => c.json({ error: "Unexpected server error", detail: error.message }, 500));

async function writeAccess(c, next) { const guard = await requireWriteAccess(c.env, accountId(c), c.get("user")); if (guard) return guard; await next(); }
async function adminAccess(c, next) { const guard = await requireAdminAccess(c.env, accountId(c), c.get("user")); if (guard) return guard; await next(); }
function accountId(c) { return c.get("accountId"); }
function normalizeFileCategory(value) { const category = String(value || "other"); return ["photo", "floor_plan", "equipment_list", "contract", "email_attachment", "document_export", "other"].includes(category) ? category : "other"; }
function safeFileName(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload.bin"; }
function publicFile(file) { return { id: file.id, fileName: file.fileName, contentType: file.contentType, sizeBytes: file.sizeBytes, category: file.category, url: `/api/files/${encodeURIComponent(file.id)}` }; }
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
    "cache-control": "private, no-store"
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
