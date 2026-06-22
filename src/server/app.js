import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { zValidator } from "@hono/zod-validator";
import { analyzeIntake, extractionToPreview, generateWorkProduct } from "./ai.js";
import { requireAdminAccess, requireWriteAccess } from "./auth.js";
import { ensureDatabase, readUser } from "./db.js";
import { ACCOUNT_ID, ensureBootstrap, publicUser, readinessReport } from "./bootstrap.js";
import { activitySchema, checklistSchema, communicationSchema, detailsSchema, documentSchema, estimateSchema, followUpSchema, generateSchema, intakeSchema, integrationSchema, profileSchema, requirementSchema, reviewSchema, settingsSchema, siteVisitSchema, statusSchema, syncSchema, todayQuerySchema } from "./contracts.js";
import { createActivity, createFileRecord, createGeneratedWorkProduct, createInquiry, createInquiryFromExtraction, deleteInquiry, getFileForDownload, getInquiryDetail, getTodayWorkspace, getUserPreferences, listCommunications, listFilesForInquiry, listInquiries, listIntegrations, listSiteVisits, logCommunication, recordAiRun, saveDocumentDraft, saveEstimateForInquiry, scheduleSiteVisit, sendOutboundCommunication, submitProposalForReview, syncInquiry, updateChecklistItem, updateInquiryDetails, updateInquiryStatus, updateMissingRequirement, updateUserPreferences, updateUserProfile, upsertIntegration } from "./repository.js";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const app = new Hono();

app.use("/api/*", secureHeaders());
app.use("/api/*", async (c, next) => {
  if (!c.env?.DB) return c.json({ ok: false, error: "D1 binding DB is not configured in this environment.", expectedBinding: "DB" }, 503);
  await ensureDatabase(c.env);
  const user = readUser(c.req.raw);
  c.set("user", user);
  await ensureBootstrap(c.env, user);
  await next();
  c.header("cache-control", "no-store");
  c.header("x-request-id", crypto.randomUUID());
});

app.get("/api/health", (c) => c.json({ ok: true, database: "D1 via Drizzle", binding: "DB", fileStorage: c.env?.FILES ? "R2" : "not_configured", router: "Hono" }));
app.get("/api/readiness", async (c) => c.json(await readinessReport(c.env, c.get("user"))));
app.get("/api/bootstrap", async (c) => {
  const user = c.get("user");
  const [inquiries, preferences, integrations] = await Promise.all([listInquiries(c.env, ACCOUNT_ID), getUserPreferences(c.env, user.id), listIntegrations(c.env, ACCOUNT_ID)]);
  return c.json({ accountId: ACCOUNT_ID, user, preferences, integrations, inquiries });
});
app.get("/api/today", zValidator("query", todayQuerySchema), async (c) => {
  const { date, timezone } = c.req.valid("query");
  return c.json(await getTodayWorkspace(c.env, ACCOUNT_ID, c.get("user").id, date, timezone));
});

app.get("/api/settings", async (c) => c.json({ preferences: await getUserPreferences(c.env, c.get("user").id) }));
app.put("/api/settings", writeAccess, zValidator("json", settingsSchema), async (c) => c.json({ preferences: await updateUserPreferences(c.env, ACCOUNT_ID, c.get("user").id, c.req.valid("json")) }));
app.patch("/api/profile", writeAccess, zValidator("json", profileSchema), async (c) => {
  const profile = await updateUserProfile(c.env, ACCOUNT_ID, c.get("user").id, c.req.valid("json"));
  return profile ? c.json({ user: publicUser(profile) }) : c.json({ error: "User not found" }, 404);
});

app.get("/api/integrations", async (c) => c.json({ integrations: await listIntegrations(c.env, ACCOUNT_ID) }));
app.post("/api/integrations", adminAccess, zValidator("json", integrationSchema), async (c) => c.json({ integration: await upsertIntegration(c.env, ACCOUNT_ID, c.get("user").id, c.req.valid("json").provider) }, 201));

app.get("/api/inquiries", async (c) => c.json({ inquiries: await listInquiries(c.env, ACCOUNT_ID, { status: c.req.query("status"), search: c.req.query("search") }) }));
app.post("/api/inquiries", writeAccess, async (c) => c.json(await createInquiry(c.env, ACCOUNT_ID, c.get("user").id, await c.req.json()), 201));

app.post("/api/ai/intake-preview", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  await recordAiRun(c.env, ACCOUNT_ID, null, c.get("user").id, { runType: "intake_extraction", provider: analysis.mode === "live" ? "openai" : "local", modelName: analysis.model, status: analysis.mode === "live" ? "success" : "fallback", inputPreview: payload.rawText, output: analysis.extraction, errorMessage: analysis.error || null, latencyMs: analysis.latencyMs || null });
  return c.json({ mode: analysis.mode, model: analysis.model, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) });
});

app.post("/api/inquiries/from-source", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  const saved = await createInquiryFromExtraction(c.env, ACCOUNT_ID, c.get("user").id, payload, analysis);
  return c.json({ ...saved, mode: analysis.mode, model: analysis.model, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) }, 201);
});

app.post("/api/intake/inbound", writeAccess, zValidator("json", intakeSchema), async (c) => {
  const payload = c.req.valid("json");
  const analysis = await analyzeIntake(c.env, payload);
  const saved = await createInquiryFromExtraction(c.env, ACCOUNT_ID, c.get("user").id, { subject: `${payload.sourceChannel} intake`, sender: "External intake", ...payload }, analysis);
  return c.json({ ...saved, accepted: true, mode: analysis.mode, model: analysis.model, error: analysis.error || null, extraction: analysis.extraction, preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode }) }, 202);
});

app.get("/api/inquiries/:id", async (c) => {
  const detail = await getInquiryDetail(c.env, ACCOUNT_ID, c.req.param("id"));
  return detail ? c.json(detail) : c.json({ error: "Inquiry not found" }, 404);
});
app.delete("/api/inquiries/:id", writeAccess, async (c) => {
  const deleted = await deleteInquiry(c.env, ACCOUNT_ID, c.req.param("id"));
  return deleted ? c.json({ deleted: true, inquiry: deleted }) : c.json({ error: "Inquiry not found" }, 404);
});
app.post("/api/inquiries/:id/activity", writeAccess, zValidator("json", activitySchema), async (c) => { const payload = c.req.valid("json"); return c.json(await createActivity(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, payload.eventType, payload.summary, payload.metadata), 201); });
app.patch("/api/inquiries/:id/details", writeAccess, zValidator("json", detailsSchema), async (c) => {
  const details = await updateInquiryDetails(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return details ? c.json({ details }) : c.json({ error: "Inquiry not found" }, 404);
});

app.post("/api/inquiries/:id/generate", writeAccess, zValidator("json", generateSchema), async (c) => {
  const payload = c.req.valid("json");
  const detail = await getInquiryDetail(c.env, ACCOUNT_ID, c.req.param("id"));
  if (!detail) return c.json({ error: "Inquiry not found" }, 404);
  const analysis = await generateWorkProduct(c.env, { ...payload, inquiry: detail.inquiry, fields: detail.fields, missing: detail.missing, summaries: detail.summaries, documents: detail.documents });
  const saved = await createGeneratedWorkProduct(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, payload.type, analysis);
  return c.json({ ...saved, mode: analysis.mode, model: analysis.model, error: analysis.error || null }, 201);
});

app.post("/api/inquiries/:id/documents", writeAccess, zValidator("json", documentSchema), async (c) => {
  const id = c.req.param("id");
  if (!await getInquiryDetail(c.env, ACCOUNT_ID, id)) return c.json({ error: "Inquiry not found" }, 404);
  return c.json({ document: await saveDocumentDraft(c.env, ACCOUNT_ID, id, c.get("user").id, c.req.valid("json")) }, 201);
});

app.get("/api/inquiries/:id/communications", async (c) => c.json({ communications: await listCommunications(c.env, ACCOUNT_ID, c.req.param("id")) }));
app.post("/api/inquiries/:id/communications", writeAccess, zValidator("json", communicationSchema), async (c) => {
  const communication = await logCommunication(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return communication ? c.json({ communication }, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.post("/api/inquiries/:id/send-follow-up", writeAccess, zValidator("json", followUpSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const detail = await getInquiryDetail(c.env, ACCOUNT_ID, id);
  if (!detail) return c.json({ error: "Inquiry not found" }, 404);
  const document = await saveDocumentDraft(c.env, ACCOUNT_ID, id, c.get("user").id, { documentId: payload.documentId, documentType: "follow_up_email", title: payload.title || `Follow-up Email - ${detail.inquiry.title}`, subject: payload.subject, body: payload.body, status: "draft", metadata: { ...payload.metadata, queuedForDelivery: true } });
  const result = await sendOutboundCommunication(c.env, ACCOUNT_ID, id, c.get("user").id, { channel: payload.channel, subject: payload.subject, body: payload.body, metadata: { ...payload.metadata, documentId: document.documentId, documentVersionId: document.versionId } });
  return c.json({ ...result, document }, result?.communication?.status === "sent" ? 200 : 202);
});

app.post("/api/inquiries/:id/proposal-review", writeAccess, zValidator("json", reviewSchema), async (c) => {
  const result = await submitProposalForReview(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return result ? c.json(result) : c.json({ error: "Proposal draft not found" }, 404);
});

app.post("/api/inquiries/:id/estimate", writeAccess, zValidator("json", estimateSchema), async (c) => {
  const result = await saveEstimateForInquiry(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return result ? c.json(result, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.get("/api/inquiries/:id/files", async (c) => c.json({ files: await listFilesForInquiry(c.env, ACCOUNT_ID, c.req.param("id")) }));
app.post("/api/inquiries/:id/files", writeAccess, async (c) => {
  if (!c.env?.FILES) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  const id = c.req.param("id");
  if (!await getInquiryDetail(c.env, ACCOUNT_ID, id)) return c.json({ error: "Inquiry not found" }, 404);
  const form = await c.req.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) return c.json({ error: "Missing file upload." }, 400);
  if (upload.size > MAX_UPLOAD_BYTES) return c.json({ error: "File is too large. Maximum upload is 12 MB." }, 413);
  const category = normalizeFileCategory(form.get("category"));
  const fileName = safeFileName(upload.name || "upload.bin");
  const storageKey = `accounts/${ACCOUNT_ID}/inquiries/${id}/${crypto.randomUUID()}-${fileName}`;
  await c.env.FILES.put(storageKey, upload.stream(), { httpMetadata: { contentType: upload.type || "application/octet-stream" }, customMetadata: { accountId: ACCOUNT_ID, inquiryId: id, fileName, category } });
  const record = await createFileRecord(c.env, ACCOUNT_ID, id, c.get("user").id, { fileName, contentType: upload.type || "application/octet-stream", storageKey, sizeBytes: upload.size, category });
  return c.json({ file: publicFile(record) }, 201);
});

app.get("/api/files/:id", async (c) => {
  if (!c.env?.FILES) return c.json({ error: "R2 binding FILES is not configured in this environment." }, 503);
  const file = await getFileForDownload(c.env, ACCOUNT_ID, c.req.param("id"));
  if (!file) return c.json({ error: "File not found" }, 404);
  const object = await c.env.FILES.get(file.storage_key);
  if (!object) return c.json({ error: "Stored file object not found" }, 404);
  return new Response(object.body, { headers: { "content-type": file.content_type, "content-length": String(file.size_bytes || object.size || 0), "content-disposition": `inline; filename="${file.file_name.replace(/"/g, "")}"`, "x-content-type-options": "nosniff", "cache-control": "private, max-age=300" } });
});

app.get("/api/inquiries/:id/site-visits", async (c) => c.json({ siteVisits: await listSiteVisits(c.env, ACCOUNT_ID, c.req.param("id")) }));
app.post("/api/inquiries/:id/site-visits", writeAccess, zValidator("json", siteVisitSchema), async (c) => {
  const result = await scheduleSiteVisit(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json"));
  return result ? c.json(result, 201) : c.json({ error: "Inquiry not found" }, 404);
});
app.patch("/api/inquiries/:id/status", writeAccess, zValidator("json", statusSchema), async (c) => {
  const result = await updateInquiryStatus(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json").status);
  return result ? c.json({ inquiry: result }) : c.json({ error: "Inquiry not found" }, 404);
});
app.patch("/api/missing-requirements/:id", writeAccess, zValidator("json", requirementSchema), async (c) => {
  const result = await updateMissingRequirement(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json").status);
  return result ? c.json({ requirement: result }) : c.json({ error: "Requirement not found" }, 404);
});
app.patch("/api/checklist-items/:id", writeAccess, zValidator("json", checklistSchema), async (c) => {
  const payload = c.req.valid("json");
  const result = await updateChecklistItem(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, payload.status, payload.notes || null);
  return result ? c.json({ checklistItem: result }) : c.json({ error: "Checklist item not found" }, 404);
});
app.post("/api/inquiries/:id/sync", writeAccess, zValidator("json", syncSchema), async (c) => {
  const result = await syncInquiry(c.env, ACCOUNT_ID, c.req.param("id"), c.get("user").id, c.req.valid("json").provider);
  return result ? c.json({ sync: result }, 201) : c.json({ error: "Inquiry not found" }, 404);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((error, c) => c.json({ error: "Unexpected server error", detail: error.message }, 500));

async function writeAccess(c, next) { const guard = await requireWriteAccess(c.env, ACCOUNT_ID, c.get("user")); if (guard) return guard; await next(); }
async function adminAccess(c, next) { const guard = await requireAdminAccess(c.env, ACCOUNT_ID, c.get("user")); if (guard) return guard; await next(); }
function normalizeFileCategory(value) { const category = String(value || "other"); return ["photo", "floor_plan", "equipment_list", "contract", "email_attachment", "other"].includes(category) ? category : "other"; }
function safeFileName(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload.bin"; }
function publicFile(file) { return { id: file.id, fileName: file.fileName, contentType: file.contentType, sizeBytes: file.sizeBytes, category: file.category, url: `/api/files/${encodeURIComponent(file.id)}` }; }
