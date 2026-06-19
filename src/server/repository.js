import { all, first, run } from "./db.js";

export async function listInquiries(env, accountId, filters = {}) {
  const clauses = ["i.account_id = ?"];
  const bindings = [accountId];
  if (filters.status) {
    clauses.push("i.status = ?");
    bindings.push(filters.status);
  }
  if (filters.search) {
    clauses.push("(i.title LIKE ? OR c.name LIKE ? OR s.city LIKE ? OR i.service_type LIKE ?)");
    const like = `%${filters.search}%`;
    bindings.push(like, like, like, like);
  }
  const result = await all(env, `
    SELECT
      i.id, i.title, i.service_type, i.priority, i.workload, i.status,
      i.estimated_low_cents, i.estimated_high_cents, i.confidence_score,
      i.lease_end_date, i.received_at,
      c.name AS company_name,
      ct.full_name AS contact_name,
      ct.email AS contact_email,
      ct.phone AS contact_phone,
      s.city, s.region,
      COUNT(m.id) AS missing_count
    FROM inquiries i
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN contacts ct ON ct.id = i.contact_id
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN missing_requirements m ON m.inquiry_id = i.id AND m.status IN ('open','requested')
    WHERE ${clauses.join(" AND ")}
    GROUP BY i.id
    ORDER BY
      CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      i.received_at DESC
  `, bindings);
  return result.results || [];
}

export async function getInquiryDetail(env, accountId, inquiryId) {
  const inquiry = await first(env, `
    SELECT
      i.*, c.name AS company_name, c.website,
      ct.full_name AS contact_name, ct.email AS contact_email, ct.phone AS contact_phone,
      s.name AS site_name, s.city, s.region, s.access_notes
    FROM inquiries i
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN contacts ct ON ct.id = i.contact_id
    LEFT JOIN sites s ON s.id = i.site_id
    WHERE i.account_id = ? AND i.id = ?
  `, [accountId, inquiryId]);
  if (!inquiry) return null;
  const [fields, missing, summaries, activity, documents, files] = await Promise.all([
    all(env, "SELECT * FROM extracted_fields WHERE inquiry_id = ? ORDER BY field_key", [inquiryId]),
    all(env, "SELECT * FROM missing_requirements WHERE inquiry_id = ? ORDER BY severity DESC, category, label", [inquiryId]),
    all(env, "SELECT * FROM ai_summaries WHERE inquiry_id = ? ORDER BY generated_at DESC", [inquiryId]),
    all(env, "SELECT * FROM activity_events WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 25", [inquiryId]),
    all(env, `
      SELECT
        d.id, d.inquiry_id, d.document_type, d.title, d.status, d.current_version,
        d.created_by_user_id, d.created_at, d.updated_at,
        v.id AS version_id, v.subject, v.body, v.metadata_json, v.generated_by_ai, v.created_at AS version_created_at
      FROM documents d
      LEFT JOIN document_versions v ON v.document_id = d.id AND v.version = d.current_version
      WHERE d.inquiry_id = ?
      ORDER BY d.updated_at DESC
    `, [inquiryId]),
    all(env, "SELECT id, file_name, content_type, size_bytes, category, uploaded_at FROM files WHERE inquiry_id = ? ORDER BY uploaded_at DESC", [inquiryId])
  ]);
  return {
    inquiry,
    fields: fields.results || [],
    missing: missing.results || [],
    summaries: summaries.results || [],
    activity: activity.results || [],
    documents: documents.results || [],
    files: files.results || []
  };
}

export async function createActivity(env, accountId, inquiryId, actorUserId, eventType, summary, metadata = {}) {
  const id = `evt_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO activity_events (id, account_id, inquiry_id, actor_user_id, event_type, summary, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, accountId, inquiryId, actorUserId, eventType, summary, JSON.stringify(metadata)]);
  return { id };
}

export async function createAuditLog(env, accountId, actorUserId, entityType, entityId, action, before = null, after = null) {
  const id = `audit_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO audit_log (id, account_id, actor_user_id, entity_type, entity_id, action, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, accountId, actorUserId, entityType, entityId, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
  return { id };
}

export async function getUserPreferences(env, userId) {
  return first(env, "SELECT * FROM user_preferences WHERE user_id = ?", [userId]);
}

export async function updateUserPreferences(env, accountId, userId, payload) {
  const before = await getUserPreferences(env, userId);
  const settings = {
    highPriorityAlerts: Boolean(payload.highPriorityAlerts),
    leaseDeadlineReminders: Boolean(payload.leaseDeadlineReminders),
    dailyDigest: Boolean(payload.dailyDigest)
  };
  await run(env, `
    UPDATE user_preferences
    SET notification_digest = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `, [settings.dailyDigest ? "daily" : "none", JSON.stringify(settings), userId]);
  const after = await getUserPreferences(env, userId);
  await createAuditLog(env, accountId, userId, "user_preferences", userId, "preferences.updated", before, after);
  return after;
}

export async function listIntegrations(env, accountId) {
  const result = await all(env, `
    SELECT id, provider, display_name, status, external_account_id, metadata_json, updated_at
    FROM integration_connections
    WHERE account_id = ?
    ORDER BY provider, display_name
  `, [accountId]);
  return result.results || [];
}

export async function upsertIntegration(env, accountId, userId, provider) {
  const displayName = integrationDisplayName(provider);
  const existing = await first(env, `
    SELECT * FROM integration_connections
    WHERE account_id = ? AND provider = ? AND display_name = ?
    LIMIT 1
  `, [accountId, provider, displayName]);
  const metadata = {
    connectedBy: userId,
    mode: "demo-ready",
    note: "Connection placeholder persisted. Add provider credentials in production deployment."
  };
  if (existing) {
    await run(env, `
      UPDATE integration_connections
      SET status = 'connected', metadata_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(metadata), existing.id]);
    await createAuditLog(env, accountId, userId, "integration_connection", existing.id, "integration.connected", existing, { ...existing, status: "connected", metadata_json: JSON.stringify(metadata) });
    return { id: existing.id, provider, displayName, status: "connected" };
  }
  const id = `int_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO integration_connections (id, account_id, provider, display_name, status, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, accountId, provider, displayName, "connected", JSON.stringify(metadata)]);
  await createAuditLog(env, accountId, userId, "integration_connection", id, "integration.connected", null, { provider, displayName, status: "connected" });
  return { id, provider, displayName, status: "connected" };
}

export async function syncInquiry(env, accountId, inquiryId, userId, provider = "crm") {
  const integration = await first(env, `
    SELECT id FROM integration_connections
    WHERE account_id = ? AND provider = ? AND status = 'connected'
    LIMIT 1
  `, [accountId, provider]);
  const connection = integration || await createDefaultIntegration(env, accountId, userId, provider);
  const inquiry = await first(env, "SELECT id, title FROM inquiries WHERE account_id = ? AND id = ?", [accountId, inquiryId]);
  if (!inquiry) return null;
  const syncId = `sync_${crypto.randomUUID()}`;
  const externalId = `${provider}_${inquiryId}`;
  await run(env, `
    INSERT INTO sync_events (id, integration_id, inquiry_id, status, operation, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [syncId, connection.id, inquiryId, "success", "upsert_opportunity", externalId]);
  await createActivity(env, accountId, inquiryId, userId, "integration.synced", `Synced ${inquiry.title} to ${provider.toUpperCase()}`, { syncId, provider, externalId });
  await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "integration.synced", null, { provider, externalId });
  return { id: syncId, provider, externalId, status: "success" };
}

export async function updateInquiryStatus(env, accountId, inquiryId, userId, status) {
  const before = await first(env, "SELECT id, status, title FROM inquiries WHERE account_id = ? AND id = ?", [accountId, inquiryId]);
  if (!before) return null;
  await run(env, "UPDATE inquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, inquiryId]);
  const after = { ...before, status };
  await createActivity(env, accountId, inquiryId, userId, "inquiry.status_updated", `Moved ${before.title} to ${status}`, { from: before.status, to: status });
  await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "status.updated", before, after);
  return after;
}

export async function updateMissingRequirement(env, accountId, requirementId, userId, status) {
  const before = await first(env, `
    SELECT m.*, i.account_id, i.title
    FROM missing_requirements m
    INNER JOIN inquiries i ON i.id = m.inquiry_id
    WHERE i.account_id = ? AND m.id = ?
    LIMIT 1
  `, [accountId, requirementId]);
  if (!before) return null;
  await run(env, `
    UPDATE missing_requirements
    SET status = ?, resolved_at = CASE WHEN ? IN ('received','waived') THEN CURRENT_TIMESTAMP ELSE resolved_at END
    WHERE id = ?
  `, [status, status, requirementId]);
  const after = { ...before, status };
  await createActivity(env, accountId, before.inquiry_id, userId, "missing_requirement.updated", `${before.label} marked ${status}`, { requirementId, from: before.status, to: status });
  await createAuditLog(env, accountId, userId, "missing_requirement", requirementId, "status.updated", before, after);
  return after;
}

export async function createInquiry(env, accountId, userId, payload) {
  const id = `inq_${crypto.randomUUID()}`;
  const companyId = `co_${crypto.randomUUID()}`;
  const contactId = `ct_${crypto.randomUUID()}`;
  const siteId = `site_${crypto.randomUUID()}`;
  const sourceId = `src_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const company = payload.company || "Unknown Company";
  const location = payload.location || {};

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO companies (id, account_id, name, website, industry)
      VALUES (?, ?, ?, ?, ?)
    `).bind(companyId, accountId, company, payload.website || null, payload.industry || null),
    env.DB.prepare(`
      INSERT INTO contacts (id, account_id, company_id, full_name, title, email, phone, preferred_channel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(contactId, accountId, companyId, payload.contact?.fullName || "Unknown Contact", payload.contact?.title || null, payload.contact?.email || null, payload.contact?.phone || null, payload.sourceChannel || "unknown"),
    env.DB.prepare(`
      INSERT INTO sites (id, account_id, company_id, name, city, region, country, site_type, access_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(siteId, accountId, companyId, payload.siteName || `${company} Site`, location.city || null, location.region || null, location.country || "US", payload.siteType || "unknown", payload.accessNotes || null),
    env.DB.prepare(`
      INSERT INTO inquiries (
        id, account_id, company_id, contact_id, site_id, owner_user_id, title, service_type,
        source_channel, priority, workload, status, confidence_score, lease_end_date,
        received_at, last_customer_activity_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, accountId, companyId, contactId, siteId, userId, payload.title || `${company} Inquiry`, payload.serviceType || "other", payload.sourceChannel || "manual", payload.priority || "medium", payload.workload || "medium", "new", payload.confidenceScore || 0, payload.leaseEndDate || null, now, now, now, now),
    env.DB.prepare(`
      INSERT INTO inquiry_sources (id, inquiry_id, channel, subject, sender, raw_text, captured_by_user_id, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(sourceId, id, payload.sourceChannel || "manual", payload.subject || null, payload.sender || null, payload.rawText || "", userId, now)
  ]);

  await createActivity(env, accountId, id, userId, "inquiry.created", `Created inquiry ${payload.title || company}`, { sourceId });
  return { id, companyId, contactId, siteId, sourceId };
}

export async function createInquiryFromExtraction(env, accountId, userId, payload, analysis) {
  const extraction = analysis.extraction;
  const companyId = await findOrCreateCompany(env, accountId, extraction.company);
  const contactId = `ct_${crypto.randomUUID()}`;
  const siteId = `site_${crypto.randomUUID()}`;
  const inquiryId = `inq_${crypto.randomUUID()}`;
  const sourceId = `src_${crypto.randomUUID()}`;
  const summaryId = `sum_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const titleLocation = [extraction.site.city, extraction.site.region].filter(Boolean).join(", ");
  const title = `${extraction.company.name}${titleLocation ? ` - ${titleLocation}` : ""}`;
  const missingCount = extraction.missingRequirements.length;
  const status = missingCount ? "needs_info" : "estimating";

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO contacts (id, account_id, company_id, full_name, email, phone, preferred_channel)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(contactId, accountId, companyId, extraction.contact.fullName, extraction.contact.email, extraction.contact.phone, extraction.contact.preferredChannel),
    env.DB.prepare(`
      INSERT INTO sites (id, account_id, company_id, name, city, region, country, site_type, access_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(siteId, accountId, companyId, extraction.site.name, extraction.site.city, extraction.site.region, extraction.site.country, extraction.site.siteType, extraction.site.accessNotes),
    env.DB.prepare(`
      INSERT INTO inquiries (
        id, account_id, company_id, contact_id, site_id, owner_user_id, title, service_type,
        source_channel, priority, workload, status, estimated_low_cents, estimated_high_cents,
        confidence_score, lease_end_date, requested_due_date, received_at, last_customer_activity_at,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      inquiryId,
      accountId,
      companyId,
      contactId,
      siteId,
      userId,
      title,
      extraction.service.type,
      payload.sourceChannel || "manual",
      extraction.priority,
      extraction.workload,
      status,
      extraction.estimateRange.lowCents,
      extraction.estimateRange.highCents,
      extraction.confidenceScore,
      extraction.timeline.leaseEndDate,
      extraction.timeline.requestedDueDate,
      now,
      now,
      now,
      now
    ),
    env.DB.prepare(`
      INSERT INTO inquiry_sources (id, inquiry_id, channel, subject, sender, raw_text, captured_by_user_id, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(sourceId, inquiryId, payload.sourceChannel || "manual", payload.subject || "AI intake source", payload.sender || extraction.contact.email || extraction.contact.phone || extraction.contact.fullName, payload.rawText, userId, now),
    env.DB.prepare(`
      INSERT INTO ai_summaries (id, inquiry_id, summary_type, body, model_name, confidence_score, generated_by_user_id, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(summaryId, inquiryId, "intake", extraction.summary, analysis.model, extraction.confidenceScore, userId, now)
  ]);

  await persistExtractedFields(env, inquiryId, sourceId, extraction);
  await persistMissingRequirements(env, inquiryId, extraction.missingRequirements);
  const aiRun = await recordAiRun(env, accountId, inquiryId, userId, {
    runType: "intake_extraction",
    provider: analysis.mode === "live" ? "openai" : "local",
    modelName: analysis.model,
    status: analysis.mode === "live" ? "success" : "fallback",
    inputPreview: payload.rawText,
    output: extraction,
    errorMessage: analysis.error || null,
    latencyMs: analysis.latencyMs || null
  });
  await createActivity(env, accountId, inquiryId, userId, "ai.intake_extracted", `${analysis.mode === "live" ? "AI" : "Fallback AI"} created structured intake for ${title}`, { aiRunId: aiRun.id, missingCount });

  return {
    id: inquiryId,
    companyId,
    contactId,
    siteId,
    sourceId,
    aiRunId: aiRun.id,
    status,
    missingCount
  };
}

export async function recordAiRun(env, accountId, inquiryId, userId, run) {
  const id = `airun_${crypto.randomUUID()}`;
  await runSql(env, `
    INSERT INTO ai_runs (
      id, account_id, inquiry_id, run_type, provider, model_name, status,
      input_preview, output_json, error_message, latency_ms, created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    accountId,
    inquiryId || null,
    run.runType,
    run.provider || "openai",
    run.modelName || null,
    run.status,
    String(run.inputPreview || "").slice(0, 1200),
    JSON.stringify(run.output || {}),
    run.errorMessage || null,
    run.latencyMs || null,
    userId
  ]);
  return { id };
}

export async function createGeneratedWorkProduct(env, accountId, inquiryId, userId, type, analysis) {
  const product = analysis.product;
  const documentId = `doc_${crypto.randomUUID()}`;
  const versionId = `docver_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const documentType = normalizeDocumentType(product.documentType || type);
  const status = product.approvalRequired ? "review" : "draft";

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO documents (id, inquiry_id, document_type, title, status, current_version, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(documentId, inquiryId, documentType, product.title, status, 1, userId, now, now),
    env.DB.prepare(`
      INSERT INTO document_versions (id, document_id, version, subject, body, metadata_json, generated_by_ai, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(versionId, documentId, 1, product.subject, product.body, JSON.stringify({
      confidenceScore: product.confidenceScore,
      approvalRequired: product.approvalRequired,
      missingRiskNotes: product.missingRiskNotes,
      nextActions: product.nextActions,
      mode: analysis.mode,
      model: analysis.model
    }), 1, userId, now)
  ]);

  let estimateId = null;
  if (["estimate", "proposal"].includes(documentType) && product.estimate.lowCents != null && product.estimate.highCents != null) {
    estimateId = await createEstimateRecords(env, inquiryId, userId, product);
  }

  let proposalId = null;
  if (documentType === "proposal") {
    proposalId = await createProposalRecords(env, inquiryId, estimateId, documentId, product);
  }

  if (documentType === "site_checklist") {
    await createSiteVisitRecords(env, inquiryId, userId, product);
  }

  const aiRun = await recordAiRun(env, accountId, inquiryId, userId, {
    runType: runTypeForDocument(documentType),
    provider: analysis.mode === "live" ? "openai" : "local",
    modelName: analysis.model,
    status: analysis.mode === "live" ? "success" : "fallback",
    inputPreview: product.title,
    output: product,
    errorMessage: analysis.error || null,
    latencyMs: analysis.latencyMs || null
  });

  await run(env, `
    INSERT INTO ai_summaries (id, inquiry_id, summary_type, body, model_name, confidence_score, generated_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    `sum_${crypto.randomUUID()}`,
    inquiryId,
    documentType === "proposal" ? "proposal" : documentType === "scope_of_work" ? "scope" : "email",
    `Generated ${product.title}. ${product.nextActions.join(" ")}`,
    analysis.model,
    product.confidenceScore,
    userId
  ]);

  await createActivity(env, accountId, inquiryId, userId, `ai.${runTypeForDocument(documentType)}`, `Generated ${product.title}`, {
    aiRunId: aiRun.id,
    documentId,
    versionId,
    estimateId,
    proposalId
  });

  return {
    documentId,
    versionId,
    estimateId,
    proposalId,
    aiRunId: aiRun.id,
    product
  };
}

export async function saveDocumentDraft(env, accountId, inquiryId, userId, payload) {
  const documentType = normalizeDocumentType(payload.documentType || "other");
  const title = payload.title || titleForDocument(documentType);
  const subject = payload.subject || null;
  const body = payload.body || "";
  const metadata = {
    ...(payload.metadata || {}),
    manuallyEdited: true,
    savedBy: userId
  };
  const now = new Date().toISOString();
  let document = null;

  if (payload.documentId) {
    document = await first(env, `
      SELECT d.*
      FROM documents d
      INNER JOIN inquiries i ON i.id = d.inquiry_id
      WHERE i.account_id = ? AND d.inquiry_id = ? AND d.id = ?
      LIMIT 1
    `, [accountId, inquiryId, payload.documentId]);
  }

  if (!document) {
    const documentId = `doc_${crypto.randomUUID()}`;
    const versionId = `docver_${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO documents (id, inquiry_id, document_type, title, status, current_version, created_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(documentId, inquiryId, documentType, title, "draft", 1, userId, now, now),
      env.DB.prepare(`
        INSERT INTO document_versions (id, document_id, version, subject, body, metadata_json, generated_by_ai, created_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(versionId, documentId, 1, subject, body, JSON.stringify(metadata), 0, userId, now)
    ]);
    await createActivity(env, accountId, inquiryId, userId, "document.created", `Saved ${title}`, { documentId, versionId, documentType });
    await createAuditLog(env, accountId, userId, "document", documentId, "document.created", null, { documentType, title, version: 1 });
    return {
      documentId,
      versionId,
      documentType,
      title,
      subject,
      body,
      metadata,
      currentVersion: 1
    };
  }

  const before = { id: document.id, current_version: document.current_version, status: document.status };
  const nextVersion = Number(document.current_version || 0) + 1;
  const versionId = `docver_${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO document_versions (id, document_id, version, subject, body, metadata_json, generated_by_ai, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(versionId, document.id, nextVersion, subject, body, JSON.stringify(metadata), 0, userId, now),
    env.DB.prepare(`
      UPDATE documents
      SET title = ?, status = ?, current_version = ?, updated_at = ?
      WHERE id = ?
    `).bind(title, payload.status || "draft", nextVersion, now, document.id)
  ]);
  await createActivity(env, accountId, inquiryId, userId, "document.version_saved", `Saved ${title} v${nextVersion}`, { documentId: document.id, versionId, documentType });
  await createAuditLog(env, accountId, userId, "document", document.id, "document.version_saved", before, { id: document.id, current_version: nextVersion, status: payload.status || "draft" });
  return {
    documentId: document.id,
    versionId,
    documentType,
    title,
    subject,
    body,
    metadata,
    currentVersion: nextVersion
  };
}

export async function createFileRecord(env, accountId, inquiryId, userId, file) {
  const inquiry = await first(env, "SELECT id, site_id FROM inquiries WHERE account_id = ? AND id = ?", [accountId, inquiryId]);
  if (!inquiry) return null;
  const id = `file_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO files (id, inquiry_id, site_id, file_name, content_type, storage_key, size_bytes, category, uploaded_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, inquiryId, inquiry.site_id || null, file.fileName, file.contentType, file.storageKey, file.sizeBytes, file.category, userId]);
  await createActivity(env, accountId, inquiryId, userId, "file.uploaded", `Uploaded ${file.fileName}`, {
    fileId: id,
    category: file.category,
    sizeBytes: file.sizeBytes
  });
  return { id, ...file };
}

export async function listFilesForInquiry(env, accountId, inquiryId) {
  const result = await all(env, `
    SELECT f.id, f.file_name, f.content_type, f.size_bytes, f.category, f.uploaded_at
    FROM files f
    INNER JOIN inquiries i ON i.id = f.inquiry_id
    WHERE i.account_id = ? AND f.inquiry_id = ?
    ORDER BY f.uploaded_at DESC
  `, [accountId, inquiryId]);
  return result.results || [];
}

export async function getFileForDownload(env, accountId, fileId) {
  return first(env, `
    SELECT f.*
    FROM files f
    INNER JOIN inquiries i ON i.id = f.inquiry_id
    WHERE i.account_id = ? AND f.id = ?
    LIMIT 1
  `, [accountId, fileId]);
}

async function findOrCreateCompany(env, accountId, company) {
  const existing = await first(env, "SELECT id FROM companies WHERE account_id = ? AND name = ? LIMIT 1", [accountId, company.name]);
  if (existing?.id) return existing.id;
  const id = `co_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO companies (id, account_id, name, website, industry)
    VALUES (?, ?, ?, ?, ?)
  `, [id, accountId, company.name, company.website || null, company.industry || null]);
  return id;
}

async function persistExtractedFields(env, inquiryId, sourceId, extraction) {
  const fields = [
    ["company_name", "Company", extraction.company.name],
    ["contact_name", "Contact", extraction.contact.fullName],
    ["contact_email", "Email", extraction.contact.email],
    ["contact_phone", "Phone", extraction.contact.phone],
    ["site_city", "City", extraction.site.city],
    ["site_region", "Region", extraction.site.region],
    ["service_type", "Service", extraction.service.label],
    ["lease_end_date", "Lease expiration date", extraction.timeline.leaseEndDate],
    ["requested_due_date", "Requested due date", extraction.timeline.requestedDueDate],
    ["access_requirements", "Site access requirements", extraction.site.accessNotes],
    ["rack_count", "Rack count", extraction.equipment.rackCount == null ? null : String(extraction.equipment.rackCount)],
    ["equipment_assets", "Equipment", extraction.equipment.assets.join(", ") || null],
    ["estimate_range", "Estimate range", centsRange(extraction.estimateRange.lowCents, extraction.estimateRange.highCents)]
  ];

  await env.DB.batch(fields.filter(([, , value]) => value !== null && value !== undefined && value !== "").map(([key, label, value]) => env.DB.prepare(`
    INSERT OR REPLACE INTO extracted_fields (id, inquiry_id, field_key, label, value_text, confidence_score, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(`field_${crypto.randomUUID()}`, inquiryId, key, label, value, extraction.confidenceScore, sourceId)));
}

async function persistMissingRequirements(env, inquiryId, requirements) {
  if (!requirements.length) return;
  await env.DB.batch(requirements.map((item) => env.DB.prepare(`
    INSERT OR IGNORE INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(`miss_${crypto.randomUUID()}`, inquiryId, item.key, item.label, item.category, item.severity, "open", item.reason)));
}

async function createEstimateRecords(env, inquiryId, userId, product) {
  const latest = await first(env, "SELECT MAX(version) AS version FROM estimates WHERE inquiry_id = ?", [inquiryId]);
  const version = Number(latest?.version || 0) + 1;
  const estimateId = `est_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO estimates (id, inquiry_id, version, status, low_cents, high_cents, assumptions, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [estimateId, inquiryId, version, product.approvalRequired ? "draft" : "approved", product.estimate.lowCents, product.estimate.highCents, product.estimate.assumptions, userId]);
  if (product.estimate.lineItems.length) {
    await env.DB.batch(product.estimate.lineItems.map((item) => {
      const total = Math.round(Number(item.quantity || 1) * Number(item.unitCostCents || 0));
      return env.DB.prepare(`
        INSERT INTO estimate_lines (id, estimate_id, line_type, description, quantity, unit, unit_cost_cents, total_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(`line_${crypto.randomUUID()}`, estimateId, item.lineType, item.description, item.quantity || 1, item.unit || "each", item.unitCostCents || 0, total);
    }));
  }
  return estimateId;
}

async function createProposalRecords(env, inquiryId, estimateId, documentId, product) {
  const proposalId = `prop_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO proposals (id, inquiry_id, estimate_id, document_id, status, price_low_cents, price_high_cents, requires_approval)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [proposalId, inquiryId, estimateId, documentId, product.approvalRequired ? "review" : "draft", product.estimate.lowCents, product.estimate.highCents, product.approvalRequired ? 1 : 0]);
  if (product.sections.length) {
    await env.DB.batch(product.sections.map((section, index) => env.DB.prepare(`
      INSERT INTO proposal_sections (id, proposal_id, section_key, title, body, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(`section_${crypto.randomUUID()}`, proposalId, section.key, section.title, section.body, index + 1)));
  }
  return proposalId;
}

async function createSiteVisitRecords(env, inquiryId, userId, product) {
  const siteVisit = await first(env, "SELECT id FROM site_visits WHERE inquiry_id = ? AND status IN ('needed','scheduled') LIMIT 1", [inquiryId]);
  const siteVisitId = siteVisit?.id || `visit_${crypto.randomUUID()}`;
  if (!siteVisit?.id) {
    await run(env, `
      INSERT INTO site_visits (id, inquiry_id, status, assigned_user_id, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [siteVisitId, inquiryId, "needed", userId, "Generated from AI site checklist workflow."]);
  }
  const checklist = product.body.split("\n").map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 12);
  if (checklist.length) {
    await env.DB.batch(checklist.map((label, index) => env.DB.prepare(`
      INSERT OR IGNORE INTO checklist_items (id, site_visit_id, item_key, label, status)
      VALUES (?, ?, ?, ?, ?)
    `).bind(`check_${crypto.randomUUID()}`, siteVisitId, `ai_item_${index + 1}`, label, "open")));
  }
}

async function createDefaultIntegration(env, accountId, userId, provider) {
  const created = await upsertIntegration(env, accountId, userId, provider);
  return { id: created.id };
}

function centsRange(low, high) {
  if (low == null || high == null) return null;
  return `$${Math.round(low / 100).toLocaleString()} - $${Math.round(high / 100).toLocaleString()}`;
}

async function runSql(env, sql, bindings) {
  return run(env, sql, bindings);
}

function normalizeDocumentType(type) {
  return ["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate", "closeout", "other"].includes(type) ? type : "other";
}

function titleForDocument(type) {
  return {
    follow_up_email: "Follow-up Email",
    proposal: "Proposal Draft",
    scope_of_work: "Scope of Work",
    site_checklist: "Site Visit Checklist",
    estimate: "Estimate",
    closeout: "Closeout",
    other: "Document"
  }[type] || "Document";
}

function runTypeForDocument(type) {
  if (type === "scope_of_work") return "scope";
  if (["follow_up_email", "proposal", "site_checklist", "estimate"].includes(type)) return type;
  return "scope";
}

function integrationDisplayName(provider) {
  return {
    crm: "CRM",
    email: "Email",
    calendar: "Calendar",
    storage: "Storage"
  }[provider] || "Other";
}
