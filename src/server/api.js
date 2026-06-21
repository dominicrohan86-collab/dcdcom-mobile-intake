import { ensureDatabase, json, readUser, run } from "./db.js";
import { analyzeIntake, extractionToPreview, generateWorkProduct } from "./ai.js";
import { requireAdminAccess, requireWriteAccess } from "./auth.js";
import { readJson, optionalEnum, requiredString, ValidationError } from "./validation.js";
import { createActivity, createFileRecord, createGeneratedWorkProduct, createInquiry, createInquiryFromExtraction, getFileForDownload, getInquiryDetail, getUserPreferences, listCommunications, listFilesForInquiry, listInquiries, listIntegrations, listSiteVisits, logCommunication, recordAiRun, saveDocumentDraft, saveEstimateForInquiry, scheduleSiteVisit, sendOutboundCommunication, submitProposalForReview, syncInquiry, updateChecklistItem, updateInquiryDetails, updateInquiryStatus, updateMissingRequirement, updateUserPreferences, updateUserProfile, upsertIntegration } from "./repository.js";

const ACCOUNT_ID = "acct_dcdcom";
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function handleApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  try {
    if (!env?.DB) {
      return json({
        ok: false,
        error: "D1 binding DB is not configured in this environment.",
        expectedBinding: "DB"
      }, 503);
    }

    await ensureDatabase(env);
    const user = readUser(request);
    await ensureBootstrap(env, user);

  if (url.pathname === "/api/health") {
    return json({ ok: true, database: "D1", binding: "DB", fileStorage: env?.FILES ? "R2" : "not_configured" });
  }

  if (url.pathname === "/api/readiness") {
    return json(await readinessReport(env, user));
  }

  if (url.pathname === "/api/bootstrap") {
    const inquiries = await listInquiries(env, ACCOUNT_ID);
    const [preferences, integrations] = await Promise.all([
      getUserPreferences(env, user.id),
      listIntegrations(env, ACCOUNT_ID)
    ]);
    return json({ accountId: ACCOUNT_ID, user, preferences, integrations, inquiries });
  }

  if (url.pathname === "/api/settings" && request.method === "GET") {
    return json({ preferences: await getUserPreferences(env, user.id) });
  }

  if (url.pathname === "/api/settings" && request.method === "PUT") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    return json({ preferences: await updateUserPreferences(env, ACCOUNT_ID, user.id, payload) });
  }

  if (url.pathname === "/api/profile" && request.method === "PATCH") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const profile = await updateUserProfile(env, ACCOUNT_ID, user.id, {
      fullName: requiredString(payload, "fullName", { maxLength: 120 }),
      avatarUrl: payload.avatarUrl || null
    });
    return profile ? json({ user: publicUser(profile) }) : json({ error: "User not found" }, 404);
  }

  if (url.pathname === "/api/integrations" && request.method === "GET") {
    return json({ integrations: await listIntegrations(env, ACCOUNT_ID) });
  }

  if (url.pathname === "/api/integrations" && request.method === "POST") {
    const guard = await requireAdminAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const provider = normalizeIntegrationProvider(requiredString(payload, "provider", { maxLength: 32 }));
    return json({ integration: await upsertIntegration(env, ACCOUNT_ID, user.id, provider) }, 201);
  }

  if (url.pathname === "/api/inquiries" && request.method === "GET") {
    return json({
      inquiries: await listInquiries(env, ACCOUNT_ID, {
        status: url.searchParams.get("status"),
        search: url.searchParams.get("search")
      })
    });
  }

  if (url.pathname === "/api/inquiries" && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    return json(await createInquiry(env, ACCOUNT_ID, user.id, payload), 201);
  }

  if (url.pathname === "/api/ai/intake-preview" && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const sourceChannel = normalizeSourceChannel(payload.sourceChannel);
    const analysis = await analyzeIntake(env, { rawText: payload.rawText, sourceChannel });
    await recordAiRun(env, ACCOUNT_ID, null, user.id, {
      runType: "intake_extraction",
      provider: analysis.mode === "live" ? "openai" : "local",
      modelName: analysis.model,
      status: analysis.mode === "live" ? "success" : "fallback",
      inputPreview: payload.rawText,
      output: analysis.extraction,
      errorMessage: analysis.error || null,
      latencyMs: analysis.latencyMs || null
    });
    return json({
      mode: analysis.mode,
      model: analysis.model,
      error: analysis.error || null,
      extraction: analysis.extraction,
      preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode })
    });
  }

  if (url.pathname === "/api/inquiries/from-source" && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const sourceChannel = normalizeSourceChannel(payload.sourceChannel);
    const analysis = await analyzeIntake(env, { rawText: payload.rawText, sourceChannel });
    const saved = await createInquiryFromExtraction(env, ACCOUNT_ID, user.id, { ...payload, sourceChannel }, analysis);
    return json({
      ...saved,
      mode: analysis.mode,
      model: analysis.model,
      error: analysis.error || null,
      extraction: analysis.extraction,
      preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode })
    }, 201);
  }

  if (url.pathname === "/api/intake/inbound" && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request, { maxBytes: 128 * 1024 });
    const sourceChannel = normalizeSourceChannel(payload.sourceChannel || payload.channel);
    const rawText = requiredString(payload, "rawText", { maxLength: 40000 });
    const analysis = await analyzeIntake(env, { rawText, sourceChannel });
    const saved = await createInquiryFromExtraction(env, ACCOUNT_ID, user.id, {
      ...payload,
      rawText,
      sourceChannel,
      subject: payload.subject || `${sourceChannel} intake`,
      sender: payload.sender || "External intake",
      externalMessageId: payload.externalMessageId || null
    }, analysis);
    return json({
      ...saved,
      accepted: true,
      mode: analysis.mode,
      model: analysis.model,
      error: analysis.error || null,
      extraction: analysis.extraction,
      preview: extractionToPreview({ ...analysis.extraction, mode: analysis.mode })
    }, 202);
  }

  const inquiryMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)$/);
  if (inquiryMatch && request.method === "GET") {
    const detail = await getInquiryDetail(env, ACCOUNT_ID, inquiryMatch[1]);
    return detail ? json(detail) : json({ error: "Inquiry not found" }, 404);
  }

  const activityMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/activity$/);
  if (activityMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    return json(await createActivity(env, ACCOUNT_ID, activityMatch[1], user.id, payload.eventType || "note", payload.summary, payload.metadata || {}), 201);
  }

  const detailsMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/details$/);
  if (detailsMatch && request.method === "PATCH") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const details = await updateInquiryDetails(env, ACCOUNT_ID, detailsMatch[1], user.id, {
      contact: requiredString(payload, "contact", { maxLength: 160 }),
      email: payload.email ? requiredString(payload, "email", { maxLength: 180 }) : "",
      phone: payload.phone ? requiredString(payload, "phone", { maxLength: 40 }) : "",
      accessNotes: payload.accessNotes ? requiredString(payload, "accessNotes", { maxLength: 600 }) : ""
    });
    return details ? json({ details }) : json({ error: "Inquiry not found" }, 404);
  }

  const generateMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/generate$/);
  if (generateMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const detail = await getInquiryDetail(env, ACCOUNT_ID, generateMatch[1]);
    if (!detail) return json({ error: "Inquiry not found" }, 404);
    const analysis = await generateWorkProduct(env, {
      type: payload.type,
      tone: payload.tone,
      inquiry: detail.inquiry,
      fields: detail.fields,
      missing: detail.missing,
      summaries: detail.summaries,
      documents: detail.documents
    });
    const saved = await createGeneratedWorkProduct(env, ACCOUNT_ID, generateMatch[1], user.id, payload.type, analysis);
    return json({
      ...saved,
      mode: analysis.mode,
      model: analysis.model,
      error: analysis.error || null
    }, 201);
  }

  const documentsMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/documents$/);
  if (documentsMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request, { maxBytes: 128 * 1024 });
    const detail = await getInquiryDetail(env, ACCOUNT_ID, documentsMatch[1]);
    if (!detail) return json({ error: "Inquiry not found" }, 404);
    const document = await saveDocumentDraft(env, ACCOUNT_ID, documentsMatch[1], user.id, {
      ...payload,
      documentType: optionalEnum(payload.documentType, ["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate", "closeout", "other"], "other"),
      title: payload.title ? requiredString(payload, "title", { maxLength: 180 }) : undefined,
      subject: payload.subject ? requiredString(payload, "subject", { maxLength: 220 }) : undefined,
      body: requiredString(payload, "body", { maxLength: 40000 }),
      status: optionalEnum(payload.status, ["draft", "review", "approved", "sent", "archived"], "draft")
    });
    return json({ document }, 201);
  }

  const communicationsMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/communications$/);
  if (communicationsMatch && request.method === "GET") {
    return json({ communications: await listCommunications(env, ACCOUNT_ID, communicationsMatch[1]) });
  }
  if (communicationsMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request, { maxBytes: 128 * 1024 });
    const communication = await logCommunication(env, ACCOUNT_ID, communicationsMatch[1], user.id, {
      direction: optionalEnum(payload.direction, ["inbound", "outbound"], "inbound"),
      channel: normalizeCommunicationChannel(payload.channel),
      subject: payload.subject ? requiredString(payload, "subject", { maxLength: 220 }) : undefined,
      body: requiredString(payload, "body", { maxLength: 40000 }),
      status: optionalEnum(payload.status, ["draft", "queued", "sent", "received", "logged", "failed"], undefined),
      externalMessageId: payload.externalMessageId || null,
      occurredAt: payload.occurredAt || null
    });
    return communication ? json({ communication }, 201) : json({ error: "Inquiry not found" }, 404);
  }

  const sendFollowUpMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/send-follow-up$/);
  if (sendFollowUpMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request, { maxBytes: 128 * 1024 });
    const detail = await getInquiryDetail(env, ACCOUNT_ID, sendFollowUpMatch[1]);
    if (!detail) return json({ error: "Inquiry not found" }, 404);
    const body = requiredString(payload, "body", { maxLength: 40000 });
    const subject = payload.subject ? requiredString(payload, "subject", { maxLength: 220 }) : "Quick follow-up on your data center project";
    const document = await saveDocumentDraft(env, ACCOUNT_ID, sendFollowUpMatch[1], user.id, {
      documentId: payload.documentId || null,
      documentType: "follow_up_email",
      title: payload.title || `Follow-up Email - ${detail.inquiry.title}`,
      subject,
      body,
      status: "draft",
      metadata: {
        ...(payload.metadata || {}),
        queuedForDelivery: true
      }
    });
    const result = await sendOutboundCommunication(env, ACCOUNT_ID, sendFollowUpMatch[1], user.id, {
      channel: normalizeCommunicationChannel(payload.channel || "email"),
      subject,
      body,
      metadata: {
        ...(payload.metadata || {}),
        documentId: document.documentId,
        documentVersionId: document.versionId
      }
    });
    return json({ ...result, document }, result?.communication?.status === "sent" ? 200 : 202);
  }

  const proposalReviewMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/proposal-review$/);
  if (proposalReviewMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const result = await submitProposalForReview(env, ACCOUNT_ID, proposalReviewMatch[1], user.id, {
      documentId: payload.documentId || null
    });
    return result ? json(result, 200) : json({ error: "Proposal draft not found" }, 404);
  }

  const estimateMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/estimate$/);
  if (estimateMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request, { maxBytes: 64 * 1024 });
    const lowCents = Number(payload.lowCents);
    const highCents = Number(payload.highCents);
    if (!Number.isFinite(lowCents) || !Number.isFinite(highCents) || lowCents <= 0 || highCents <= 0 || highCents < lowCents) {
      throw new ValidationError("A valid estimate range is required.", 400);
    }
    const result = await saveEstimateForInquiry(env, ACCOUNT_ID, estimateMatch[1], user.id, {
      lowCents,
      highCents,
      assumptions: payload.assumptions || null,
      lineItems: Array.isArray(payload.lineItems) ? payload.lineItems : []
    });
    return result ? json(result, 201) : json({ error: "Inquiry not found" }, 404);
  }

  const filesMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/files$/);
  if (filesMatch && request.method === "GET") {
    return json({ files: await listFilesForInquiry(env, ACCOUNT_ID, filesMatch[1]) });
  }
  if (filesMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    if (!env?.FILES) {
      return json({ error: "R2 binding FILES is not configured in this environment." }, 503);
    }
    const detail = await getInquiryDetail(env, ACCOUNT_ID, filesMatch[1]);
    if (!detail) return json({ error: "Inquiry not found" }, 404);
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) return json({ error: "Missing file upload." }, 400);
    if (upload.size > MAX_UPLOAD_BYTES) return json({ error: "File is too large. Maximum upload is 12 MB." }, 413);
    const category = normalizeFileCategory(form.get("category"));
    const fileName = safeFileName(upload.name || "upload.bin");
    const storageKey = `accounts/${ACCOUNT_ID}/inquiries/${filesMatch[1]}/${crypto.randomUUID()}-${fileName}`;
    await env.FILES.put(storageKey, upload.stream(), {
      httpMetadata: { contentType: upload.type || "application/octet-stream" },
      customMetadata: {
        accountId: ACCOUNT_ID,
        inquiryId: filesMatch[1],
        fileName,
        category
      }
    });
    const record = await createFileRecord(env, ACCOUNT_ID, filesMatch[1], user.id, {
      fileName,
      contentType: upload.type || "application/octet-stream",
      storageKey,
      sizeBytes: upload.size,
      category
    });
    return json({ file: publicFile(record) }, 201);
  }

  const siteVisitsMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/site-visits$/);
  if (siteVisitsMatch && request.method === "GET") {
    return json({ siteVisits: await listSiteVisits(env, ACCOUNT_ID, siteVisitsMatch[1]) });
  }
  if (siteVisitsMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request, { maxBytes: 64 * 1024 });
    const result = await scheduleSiteVisit(env, ACCOUNT_ID, siteVisitsMatch[1], user.id, {
      scheduledStart: payload.scheduledStart || null,
      scheduledEnd: payload.scheduledEnd || null,
      notes: payload.notes || null,
      checklist: Array.isArray(payload.checklist) ? payload.checklist.map(String).slice(0, 20) : undefined
    });
    return result ? json(result, 201) : json({ error: "Inquiry not found" }, 404);
  }

  const downloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
  if (downloadMatch && request.method === "GET") {
    if (!env?.FILES) return json({ error: "R2 binding FILES is not configured in this environment." }, 503);
    const file = await getFileForDownload(env, ACCOUNT_ID, downloadMatch[1]);
    if (!file) return json({ error: "File not found" }, 404);
    const object = await env.FILES.get(file.storage_key);
    if (!object) return json({ error: "Stored file object not found" }, 404);
    return new Response(object.body, {
      headers: {
        "content-type": file.content_type,
        "content-length": String(file.size_bytes || object.size || 0),
        "content-disposition": `inline; filename="${file.file_name.replace(/"/g, "")}"`,
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "cache-control": "private, max-age=300"
      }
    });
  }

  const statusMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const status = optionalEnum(payload.status, ["new", "needs_info", "estimating", "site_visit", "proposal", "review", "won", "lost", "archived"], "new");
    const updated = await updateInquiryStatus(env, ACCOUNT_ID, statusMatch[1], user.id, status);
    return updated ? json({ inquiry: updated }) : json({ error: "Inquiry not found" }, 404);
  }

  const missingMatch = url.pathname.match(/^\/api\/missing-requirements\/([^/]+)$/);
  if (missingMatch && request.method === "PATCH") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const status = optionalEnum(payload.status, ["open", "requested", "received", "waived"], "open");
    const updated = await updateMissingRequirement(env, ACCOUNT_ID, missingMatch[1], user.id, status);
    return updated ? json({ requirement: updated }) : json({ error: "Requirement not found" }, 404);
  }

  const checklistMatch = url.pathname.match(/^\/api\/checklist-items\/([^/]+)$/);
  if (checklistMatch && request.method === "PATCH") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const status = optionalEnum(payload.status, ["open", "done", "not_applicable"], "open");
    const updated = await updateChecklistItem(env, ACCOUNT_ID, checklistMatch[1], user.id, status, payload.notes || null);
    return updated ? json({ checklistItem: updated }) : json({ error: "Checklist item not found" }, 404);
  }

  const syncMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/sync$/);
  if (syncMatch && request.method === "POST") {
    const guard = await requireWriteAccess(env, ACCOUNT_ID, user);
    if (guard) return guard;
    const payload = await readJson(request);
    const provider = normalizeIntegrationProvider(payload.provider || "crm");
    const result = await syncInquiry(env, ACCOUNT_ID, syncMatch[1], user.id, provider);
    return result ? json({ sync: result }, 201) : json({ error: "Inquiry not found" }, 404);
  }

  return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof ValidationError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: "Unexpected server error", detail: error.message }, 500);
  }
}

function normalizeSourceChannel(channel) {
  const normalized = String(channel || "manual").toLowerCase();
  return ["email", "phone", "text", "manual", "photo", "web"].includes(normalized) ? normalized : "manual";
}

function normalizeCommunicationChannel(channel) {
  const normalized = String(channel || "internal_note").toLowerCase();
  if (["email", "phone", "text", "internal_note"].includes(normalized)) return normalized;
  if (["manual", "photo", "web"].includes(normalized)) return "internal_note";
  return "internal_note";
}

function normalizeFileCategory(category) {
  const normalized = String(category || "other").toLowerCase();
  return ["photo", "floor_plan", "equipment_list", "contract", "email_attachment", "other"].includes(normalized) ? normalized : "other";
}

function normalizeIntegrationProvider(provider) {
  const normalized = String(provider || "crm").toLowerCase();
  return ["crm", "email", "calendar", "storage", "other"].includes(normalized) ? normalized : "other";
}

function safeFileName(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "upload.bin";
}

function publicFile(file) {
  return {
    id: file.id,
    fileName: file.fileName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    category: file.category,
    url: `/api/files/${encodeURIComponent(file.id)}`
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name || user.fullName,
    role: user.role,
    avatarUrl: user.avatar_url || null
  };
}

async function ensureBootstrap(env, user) {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO accounts (id, name, domain)
      VALUES (?, ?, ?)
    `).bind(ACCOUNT_ID, "DCDcom", "dcdcom.com"),
    env.DB.prepare(`
      INSERT OR IGNORE INTO users (id, account_id, email, full_name, role)
      VALUES (?, ?, ?, ?, ?)
    `).bind(user.id, ACCOUNT_ID, user.email, user.fullName, "project_manager"),
    env.DB.prepare(`
      INSERT OR IGNORE INTO user_preferences (user_id)
      VALUES (?)
    `).bind(user.id)
  ]);

  const existing = await env.DB.prepare("SELECT id FROM inquiries WHERE account_id = ? LIMIT 1").bind(ACCOUNT_ID).first();
  if (existing) return;

  await run(env, `
    INSERT INTO companies (id, account_id, name, industry)
    VALUES (?, ?, ?, ?)
  `, ["co_ntt", ACCOUNT_ID, "NTT Data", "Data Centers"]);
  await run(env, `
    INSERT INTO contacts (id, account_id, company_id, full_name, email, phone, preferred_channel)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ["ct_michael", ACCOUNT_ID, "co_ntt", "Michael Reynolds", "mreynolds@nttdata.com", "(571) 555-0134", "email"]);
  await run(env, `
    INSERT INTO sites (id, account_id, company_id, name, city, region, site_type, access_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ["site_ashburn", ACCOUNT_ID, "co_ntt", "Ashburn Data Center", "Ashburn", "VA", "data_center", "After hours"]);
  await run(env, `
    INSERT INTO inquiries (
      id, account_id, company_id, contact_id, site_id, owner_user_id, title, service_type,
      source_channel, priority, workload, status, estimated_low_cents, estimated_high_cents,
      confidence_score, lease_end_date, received_at, last_customer_activity_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `, ["inq_ntt_ashburn", ACCOUNT_ID, "co_ntt", "ct_michael", "site_ashburn", user.id, "NTT Data - Ashburn, VA", "data_center_decommissioning", "phone", "high", "medium", "needs_info", 2850000, 4500000, 78, "2025-07-31"]);
  await run(env, `
    INSERT INTO inquiry_sources (id, inquiry_id, channel, subject, sender, raw_text, captured_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ["src_ntt_call", "inq_ntt_ashburn", "phone", "Call notes", "Michael Reynolds", "Customer requested data center decommissioning in Ashburn with rack removal, cable abatement, HVAC removal, and site cleanup.", user.id]);
  await run(env, `
    INSERT INTO communications (id, inquiry_id, contact_id, direction, channel, subject, body, status, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ["comm_ntt_seed_call", "inq_ntt_ashburn", "ct_michael", "inbound", "phone", "Call notes", "Customer requested data center decommissioning in Ashburn with rack removal, cable abatement, HVAC removal, and site cleanup.", "received", user.id]);
  await run(env, `
    INSERT INTO ai_summaries (id, inquiry_id, summary_type, body, model_name, confidence_score, generated_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ["sum_ntt_intake", "inq_ntt_ashburn", "intake", "Client is requesting decommissioning of a data center suite. Timeline appears urgent and key details are missing on equipment and access.", "mock-extractor-v1", 78, user.id]);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("miss_ntt_sqft", "inq_ntt_ashburn", "square_footage", "Square footage / suite size", "scope", "high", "open"),
    env.DB.prepare("INSERT INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("miss_ntt_racks", "inq_ntt_ashburn", "rack_count", "Number of racks / cabinets", "equipment", "high", "open"),
    env.DB.prepare("INSERT INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("miss_ntt_photos", "inq_ntt_ashburn", "site_photos", "Photos or docs from site", "documentation", "medium", "open")
  ]);
  await createActivity(env, ACCOUNT_ID, "inq_ntt_ashburn", user.id, "inquiry.seeded", "Seeded NTT Data inquiry for demo workspace");
}

async function readinessReport(env, user) {
  const tableInfo = await env.DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").first();
  const account = await env.DB.prepare("SELECT id FROM accounts WHERE id = ?").bind(ACCOUNT_ID).first();
  const checks = [
    { key: "d1_binding", ok: Boolean(env.DB), detail: "D1 binding DB is configured." },
    { key: "r2_binding", ok: Boolean(env.FILES), detail: env.FILES ? "R2 binding FILES is configured." : "R2 binding FILES is missing." },
    { key: "schema", ok: Number(tableInfo?.count || 0) >= 28, detail: `${tableInfo?.count || 0} database tables available.` },
    { key: "account", ok: Boolean(account), detail: account ? "DCDcom account is present." : "DCDcom account bootstrap is missing." },
    { key: "user_identity", ok: Boolean(user?.email), detail: user?.email ? `Authenticated as ${user.email}.` : "No user identity detected." },
    { key: "openai_key", ok: Boolean(env.OPENAI_API_KEY), warningOnly: true, detail: env.OPENAI_API_KEY ? "Live OpenAI extraction is configured." : "OPENAI_API_KEY is missing; fallback AI will be used." }
  ];
  const blocking = checks.filter((check) => !check.ok && !check.warningOnly);
  const warnings = checks.filter((check) => !check.ok && check.warningOnly);
  return {
    ready: blocking.length === 0,
    status: blocking.length ? "blocked" : warnings.length ? "degraded" : "ready",
    checkedAt: new Date().toISOString(),
    checks
  };
}
