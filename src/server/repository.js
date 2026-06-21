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
  const [fields, missing, summaries, activity, documents, files, communications, siteVisits] = await Promise.all([
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
    all(env, "SELECT id, file_name, content_type, size_bytes, category, uploaded_at FROM files WHERE inquiry_id = ? ORDER BY uploaded_at DESC", [inquiryId]),
    listCommunications(env, accountId, inquiryId),
    listSiteVisits(env, accountId, inquiryId)
  ]);
  return {
    inquiry,
    fields: fields.results || [],
    missing: missing.results || [],
    summaries: summaries.results || [],
    activity: activity.results || [],
    documents: documents.results || [],
    files: files.results || [],
    communications,
    siteVisits
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

export async function updateUserProfile(env, accountId, userId, payload) {
  const before = await first(env, "SELECT id, account_id, email, full_name, role, avatar_url, is_active FROM users WHERE account_id = ? AND id = ?", [accountId, userId]);
  if (!before) return null;
  const fullName = String(payload.fullName || before.full_name).trim() || before.full_name;
  const avatarUrl = payload.avatarUrl === undefined ? before.avatar_url : String(payload.avatarUrl || "").trim() || null;
  await run(env, `
    UPDATE users
    SET full_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE account_id = ? AND id = ?
  `, [fullName, avatarUrl, accountId, userId]);
  const after = await first(env, "SELECT id, account_id, email, full_name, role, avatar_url, is_active FROM users WHERE account_id = ? AND id = ?", [accountId, userId]);
  await createAuditLog(env, accountId, userId, "user", userId, "profile.updated", before, after);
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

export async function updateInquiryDetails(env, accountId, inquiryId, userId, payload) {
  const before = await first(env, `
    SELECT i.id, i.title, i.contact_id, i.site_id,
      ct.full_name, ct.email, ct.phone,
      s.access_notes
    FROM inquiries i
    LEFT JOIN contacts ct ON ct.id = i.contact_id
    LEFT JOIN sites s ON s.id = i.site_id
    WHERE i.account_id = ? AND i.id = ?
    LIMIT 1
  `, [accountId, inquiryId]);
  if (!before) return null;

  const contactName = String(payload.contact || before.full_name || "Unknown Contact").trim() || "Unknown Contact";
  const email = String(payload.email || before.email || "").trim() || null;
  const phone = String(payload.phone || before.phone || "").trim() || null;
  const accessNotes = String(payload.accessNotes || before.access_notes || "").trim() || null;

  const statements = [];
  if (before.contact_id) {
    statements.push(env.DB.prepare(`
      UPDATE contacts
      SET full_name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(contactName, email, phone, before.contact_id));
  }
  if (before.site_id) {
    statements.push(env.DB.prepare(`
      UPDATE sites
      SET access_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(accessNotes, before.site_id));
  }
  statements.push(env.DB.prepare("UPDATE inquiries SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(inquiryId));
  if (statements.length) await env.DB.batch(statements);

  await upsertExtractedField(env, inquiryId, "contact_name", "Contact", contactName, 100);
  await upsertExtractedField(env, inquiryId, "contact_email", "Email", email, 100);
  await upsertExtractedField(env, inquiryId, "contact_phone", "Phone", phone, 100);
  await upsertExtractedField(env, inquiryId, "access_requirements", "Site access requirements", accessNotes, 100);

  const after = await first(env, `
    SELECT i.id, i.title, i.contact_id, i.site_id,
      ct.full_name, ct.email, ct.phone,
      s.access_notes
    FROM inquiries i
    LEFT JOIN contacts ct ON ct.id = i.contact_id
    LEFT JOIN sites s ON s.id = i.site_id
    WHERE i.account_id = ? AND i.id = ?
    LIMIT 1
  `, [accountId, inquiryId]);
  await createActivity(env, accountId, inquiryId, userId, "inquiry.details_updated", `Updated extracted details for ${before.title}`, {
    contactName,
    email,
    phone,
    accessNotes
  });
  await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "details.updated", before, after);
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
    `).bind(sourceId, id, payload.sourceChannel || "manual", payload.subject || null, payload.sender || null, payload.rawText || "", userId, now),
    env.DB.prepare(`
      INSERT INTO communications (id, inquiry_id, contact_id, direction, channel, subject, body, status, external_message_id, created_by_user_id, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(`comm_${crypto.randomUUID()}`, id, contactId, "inbound", communicationChannel(payload.sourceChannel || "manual"), payload.subject || null, payload.rawText || "", "received", payload.externalMessageId || null, userId, now)
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
      INSERT INTO communications (id, inquiry_id, contact_id, direction, channel, subject, body, status, external_message_id, created_by_user_id, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(`comm_${crypto.randomUUID()}`, inquiryId, contactId, "inbound", communicationChannel(payload.sourceChannel || "manual"), payload.subject || "AI intake source", payload.rawText, "received", payload.externalMessageId || null, userId, now),
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

export async function submitProposalForReview(env, accountId, inquiryId, userId, payload = {}) {
  const inquiry = await first(env, "SELECT id, title, status FROM inquiries WHERE account_id = ? AND id = ?", [accountId, inquiryId]);
  if (!inquiry) return null;
  const document = await first(env, `
    SELECT
      d.id, d.title, d.status, d.current_version,
      v.id AS version_id, v.subject, v.body, v.metadata_json
    FROM documents d
    LEFT JOIN document_versions v ON v.document_id = d.id AND v.version = d.current_version
    WHERE d.inquiry_id = ? AND d.document_type = 'proposal'
      AND (? IS NULL OR d.id = ?)
    ORDER BY d.updated_at DESC
    LIMIT 1
  `, [inquiryId, payload.documentId || null, payload.documentId || null]);
  if (!document) return null;

  const before = {
    inquiryStatus: inquiry.status,
    documentStatus: document.status
  };
  const metadata = safeJson(document.metadata_json) || {};
  const estimate = metadata.estimate || {};
  await env.DB.batch([
    env.DB.prepare("UPDATE documents SET status = 'review', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(document.id),
    env.DB.prepare("UPDATE inquiries SET status = 'review', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(inquiryId)
  ]);

  let proposal = await first(env, "SELECT * FROM proposals WHERE document_id = ? ORDER BY created_at DESC LIMIT 1", [document.id]);
  if (proposal) {
    await run(env, "UPDATE proposals SET status = 'review', requires_approval = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [proposal.id]);
    proposal = await first(env, "SELECT * FROM proposals WHERE id = ?", [proposal.id]);
  } else {
    const proposalId = `prop_${crypto.randomUUID()}`;
    await run(env, `
      INSERT INTO proposals (id, inquiry_id, document_id, status, price_low_cents, price_high_cents, requires_approval)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [proposalId, inquiryId, document.id, "review", estimate.lowCents || null, estimate.highCents || null, 1]);
    proposal = await first(env, "SELECT * FROM proposals WHERE id = ?", [proposalId]);
  }

  await createActivity(env, accountId, inquiryId, userId, "proposal.submitted_for_review", `Submitted proposal for ${inquiry.title} to internal review`, {
    documentId: document.id,
    versionId: document.version_id,
    proposalId: proposal.id
  });
  await createAuditLog(env, accountId, userId, "proposal", proposal.id, "proposal.submitted_for_review", before, {
    inquiryStatus: "review",
    documentStatus: "review",
    proposalStatus: proposal.status
  });
  return {
    document: {
      documentId: document.id,
      versionId: document.version_id,
      documentType: "proposal",
      title: document.title,
      subject: document.subject || null,
      body: document.body || "",
      metadata,
      currentVersion: document.current_version,
      status: "review"
    },
    proposal,
    inquiry: { ...inquiry, status: "review" }
  };
}

export async function saveEstimateForInquiry(env, accountId, inquiryId, userId, payload = {}) {
  const inquiry = await first(env, "SELECT id, title, status FROM inquiries WHERE account_id = ? AND id = ?", [accountId, inquiryId]);
  if (!inquiry) return null;
  const lowCents = Number(payload.lowCents || 0);
  const highCents = Number(payload.highCents || 0);
  if (!Number.isFinite(lowCents) || !Number.isFinite(highCents) || lowCents <= 0 || highCents <= 0 || highCents < lowCents) {
    throw new Error("A valid estimate range is required.");
  }
  const latest = await first(env, "SELECT MAX(version) AS version FROM estimates WHERE inquiry_id = ?", [inquiryId]);
  const version = Number(latest?.version || 0) + 1;
  const estimateId = `est_${crypto.randomUUID()}`;
  const assumptions = String(payload.assumptions || "Estimate saved from mobile estimate workflow.").slice(0, 2000);
  await run(env, `
    INSERT INTO estimates (id, inquiry_id, version, status, low_cents, high_cents, assumptions, created_by_user_id, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [estimateId, inquiryId, version, "approved", Math.round(lowCents), Math.round(highCents), assumptions, userId]);

  const lines = normalizeEstimateLines(payload.lineItems, lowCents);
  if (lines.length) {
    await env.DB.batch(lines.map((line) => env.DB.prepare(`
      INSERT INTO estimate_lines (id, estimate_id, line_type, description, quantity, unit, unit_cost_cents, total_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(`line_${crypto.randomUUID()}`, estimateId, line.lineType, line.description, line.quantity, line.unit, line.unitCostCents, Math.round(line.quantity * line.unitCostCents))));
  }

  await run(env, `
    UPDATE inquiries
    SET estimated_low_cents = ?, estimated_high_cents = ?, status = 'estimating', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [Math.round(lowCents), Math.round(highCents), inquiryId]);
  const estimate = await first(env, "SELECT * FROM estimates WHERE id = ?", [estimateId]);
  await createActivity(env, accountId, inquiryId, userId, "estimate.saved", `Saved estimate for ${inquiry.title}`, {
    estimateId,
    version,
    lowCents: Math.round(lowCents),
    highCents: Math.round(highCents)
  });
  await createAuditLog(env, accountId, userId, "estimate", estimateId, "estimate.saved", null, estimate);
  return { estimate, lineItems: lines, inquiry: { ...inquiry, status: "estimating", estimated_low_cents: Math.round(lowCents), estimated_high_cents: Math.round(highCents) } };
}

export async function listCommunications(env, accountId, inquiryId) {
  const result = await all(env, `
    SELECT c.*
    FROM communications c
    INNER JOIN inquiries i ON i.id = c.inquiry_id
    WHERE i.account_id = ? AND c.inquiry_id = ?
    ORDER BY c.occurred_at DESC
  `, [accountId, inquiryId]);
  return result.results || [];
}

export async function logCommunication(env, accountId, inquiryId, userId, payload) {
  const inquiry = await first(env, `
    SELECT id, title, contact_id
    FROM inquiries
    WHERE account_id = ? AND id = ?
    LIMIT 1
  `, [accountId, inquiryId]);
  if (!inquiry) return null;
  const direction = payload.direction === "outbound" ? "outbound" : "inbound";
  const channel = communicationChannel(payload.channel || "internal_note");
  const status = payload.status || (direction === "inbound" ? "received" : "draft");
  const now = new Date().toISOString();
  const id = `comm_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO communications (
      id, inquiry_id, contact_id, direction, channel, subject, body, status,
      external_message_id, created_by_user_id, occurred_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    inquiryId,
    payload.contactId || inquiry.contact_id || null,
    direction,
    channel,
    payload.subject || null,
    payload.body || "",
    status,
    payload.externalMessageId || null,
    userId,
    payload.occurredAt || now
  ]);
  if (direction === "inbound") {
    await run(env, "UPDATE inquiries SET last_customer_activity_at = ?, updated_at = ? WHERE id = ?", [payload.occurredAt || now, now, inquiryId]);
  }
  await createActivity(env, accountId, inquiryId, userId, `communication.${direction}`, `${direction === "outbound" ? "Prepared" : "Logged"} ${channelLabel(channel)} for ${inquiry.title}`, {
    communicationId: id,
    channel,
    status
  });
  await createAuditLog(env, accountId, userId, "communication", id, "communication.logged", null, { inquiryId, direction, channel, status });
  return {
    id,
    inquiry_id: inquiryId,
    contact_id: payload.contactId || inquiry.contact_id || null,
    direction,
    channel,
    subject: payload.subject || null,
    body: payload.body || "",
    status,
    external_message_id: payload.externalMessageId || null,
    created_by_user_id: userId,
    occurred_at: payload.occurredAt || now
  };
}

export async function sendOutboundCommunication(env, accountId, inquiryId, userId, payload) {
  const inquiry = await first(env, `
    SELECT i.id, i.title, i.contact_id, ct.email, ct.phone, ct.full_name
    FROM inquiries i
    LEFT JOIN contacts ct ON ct.id = i.contact_id
    WHERE i.account_id = ? AND i.id = ?
    LIMIT 1
  `, [accountId, inquiryId]);
  if (!inquiry) return null;
  const channel = communicationChannel(payload.channel || "email");
  const body = String(payload.body || "").trim();
  const subject = payload.subject || (channel === "email" ? `Follow-up on ${inquiry.title}` : null);
  const webhook = communicationWebhook(env, channel);
  const communication = await logCommunication(env, accountId, inquiryId, userId, {
    direction: "outbound",
    channel,
    subject,
    body,
    status: webhook ? "queued" : "queued"
  });
  const provider = channel === "text" ? "sms_webhook" : channel === "email" ? "email_webhook" : "manual_log";
  const requestPayload = {
    communicationId: communication.id,
    inquiryId,
    to: channel === "text" ? inquiry.phone : inquiry.email,
    contactName: inquiry.full_name,
    subject,
    body,
    metadata: payload.metadata || {}
  };

  if (!webhook) {
    const delivery = await createDeliveryAttempt(env, communication.id, {
      provider,
      status: "queued",
      request: requestPayload,
      response: {},
      errorMessage: `${channelLabel(channel)} provider webhook is not configured.`
    });
    await createActivity(env, accountId, inquiryId, userId, "communication.queued", `Queued ${channelLabel(channel)} for provider setup`, {
      communicationId: communication.id,
      deliveryId: delivery.id
    });
    return { communication, delivery };
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestPayload)
    });
    const responseText = await response.text();
    const responseBody = safeJson(responseText) || { body: responseText.slice(0, 1200) };
    const status = response.ok ? "sent" : "failed";
    const externalId = responseBody.id || responseBody.messageId || responseBody.externalMessageId || null;
    await run(env, "UPDATE communications SET status = ?, external_message_id = ? WHERE id = ?", [status, externalId, communication.id]);
    const delivery = await createDeliveryAttempt(env, communication.id, {
      provider,
      status,
      request: requestPayload,
      response: responseBody,
      errorMessage: response.ok ? null : `Provider returned ${response.status}`
    });
    await createActivity(env, accountId, inquiryId, userId, response.ok ? "communication.sent" : "communication.failed", `${response.ok ? "Sent" : "Failed"} ${channelLabel(channel)} for ${inquiry.title}`, {
      communicationId: communication.id,
      deliveryId: delivery.id,
      externalId
    });
    return {
      communication: { ...communication, status, external_message_id: externalId },
      delivery
    };
  } catch (error) {
    await run(env, "UPDATE communications SET status = 'failed' WHERE id = ?", [communication.id]);
    const delivery = await createDeliveryAttempt(env, communication.id, {
      provider,
      status: "failed",
      request: requestPayload,
      response: {},
      errorMessage: error.message
    });
    await createActivity(env, accountId, inquiryId, userId, "communication.failed", `Failed ${channelLabel(channel)} delivery for ${inquiry.title}`, {
      communicationId: communication.id,
      deliveryId: delivery.id
    });
    return {
      communication: { ...communication, status: "failed" },
      delivery
    };
  }
}

export async function listSiteVisits(env, accountId, inquiryId) {
  const visits = await all(env, `
    SELECT v.*
    FROM site_visits v
    INNER JOIN inquiries i ON i.id = v.inquiry_id
    WHERE i.account_id = ? AND v.inquiry_id = ?
    ORDER BY
      CASE v.status WHEN 'scheduled' THEN 0 WHEN 'needed' THEN 1 WHEN 'complete' THEN 2 ELSE 3 END,
      COALESCE(v.scheduled_start, v.created_at) DESC
  `, [accountId, inquiryId]);
  const rows = visits.results || [];
  if (!rows.length) return [];
  const items = await all(env, `
    SELECT ci.*
    FROM checklist_items ci
    INNER JOIN site_visits v ON v.id = ci.site_visit_id
    INNER JOIN inquiries i ON i.id = v.inquiry_id
    WHERE i.account_id = ? AND v.inquiry_id = ?
    ORDER BY ci.label
  `, [accountId, inquiryId]);
  const byVisit = new Map(rows.map((visit) => [visit.id, { ...visit, checklistItems: [] }]));
  for (const item of items.results || []) {
    byVisit.get(item.site_visit_id)?.checklistItems.push(item);
  }
  return [...byVisit.values()];
}

export async function scheduleSiteVisit(env, accountId, inquiryId, userId, payload = {}) {
  const inquiry = await first(env, `
    SELECT i.id, i.title, i.site_id
    FROM inquiries i
    WHERE i.account_id = ? AND i.id = ?
    LIMIT 1
  `, [accountId, inquiryId]);
  if (!inquiry) return null;
  const existing = await first(env, "SELECT * FROM site_visits WHERE inquiry_id = ? AND status IN ('needed','scheduled') ORDER BY created_at DESC LIMIT 1", [inquiryId]);
  const now = new Date().toISOString();
  const scheduledStart = payload.scheduledStart || defaultSiteVisitStart();
  const scheduledEnd = payload.scheduledEnd || addHours(scheduledStart, 1);
  const notes = payload.notes || "Site visit scheduled from mobile workflow.";
  const visitId = existing?.id || `visit_${crypto.randomUUID()}`;

  if (existing) {
    await run(env, `
      UPDATE site_visits
      SET scheduled_start = ?, scheduled_end = ?, status = 'scheduled', assigned_user_id = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `, [scheduledStart, scheduledEnd, userId, notes, now, visitId]);
  } else {
    await run(env, `
      INSERT INTO site_visits (id, inquiry_id, site_id, scheduled_start, scheduled_end, status, assigned_user_id, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [visitId, inquiryId, inquiry.site_id || null, scheduledStart, scheduledEnd, "scheduled", userId, notes, now, now]);
  }

  await ensureChecklistItems(env, visitId, payload.checklist || defaultChecklistLabels());
  await run(env, "UPDATE inquiries SET status = 'site_visit', updated_at = ? WHERE id = ?", [now, inquiryId]);
  const calendarSync = await queueCalendarHold(env, accountId, inquiryId, userId, {
    visitId,
    title: `Site visit: ${inquiry.title}`,
    scheduledStart,
    scheduledEnd
  });
  const siteVisit = await first(env, "SELECT * FROM site_visits WHERE id = ?", [visitId]);
  await createActivity(env, accountId, inquiryId, userId, "site_visit.scheduled", `Scheduled site visit for ${inquiry.title}`, {
    visitId,
    scheduledStart,
    scheduledEnd,
    calendarSyncId: calendarSync?.id
  });
  await createAuditLog(env, accountId, userId, "site_visit", visitId, existing ? "site_visit.rescheduled" : "site_visit.scheduled", existing, siteVisit);
  return {
    siteVisit: {
      ...siteVisit,
      checklistItems: (await listSiteVisits(env, accountId, inquiryId)).find((visit) => visit.id === visitId)?.checklistItems || []
    },
    calendarSync
  };
}

export async function updateChecklistItem(env, accountId, itemId, userId, status, notes = null) {
  const before = await first(env, `
    SELECT ci.*, v.inquiry_id, i.account_id, i.title
    FROM checklist_items ci
    INNER JOIN site_visits v ON v.id = ci.site_visit_id
    INNER JOIN inquiries i ON i.id = v.inquiry_id
    WHERE i.account_id = ? AND ci.id = ?
    LIMIT 1
  `, [accountId, itemId]);
  if (!before) return null;
  await run(env, `
    UPDATE checklist_items
    SET status = ?, notes = COALESCE(?, notes), completed_by_user_id = CASE WHEN ? = 'done' THEN ? ELSE completed_by_user_id END,
        completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id = ?
  `, [status, notes, status, userId, status, itemId]);
  const after = await first(env, "SELECT * FROM checklist_items WHERE id = ?", [itemId]);
  await createActivity(env, accountId, before.inquiry_id, userId, "checklist_item.updated", `${before.label} marked ${status}`, {
    checklistItemId: itemId,
    from: before.status,
    to: status
  });
  await createAuditLog(env, accountId, userId, "checklist_item", itemId, "checklist_item.updated", before, after);
  await completeVisitIfReady(env, before.site_visit_id);
  return after;
}

async function ensureChecklistItems(env, visitId, labels) {
  const existing = await all(env, "SELECT item_key FROM checklist_items WHERE site_visit_id = ?", [visitId]);
  const keys = new Set((existing.results || []).map((item) => item.item_key));
  const statements = labels.map((label) => {
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 42) || `item_${crypto.randomUUID()}`;
    if (keys.has(key)) return null;
    return env.DB.prepare(`
      INSERT OR IGNORE INTO checklist_items (id, site_visit_id, item_key, label, status)
      VALUES (?, ?, ?, ?, ?)
    `).bind(`check_${crypto.randomUUID()}`, visitId, key, label, "open");
  }).filter(Boolean);
  if (statements.length) await env.DB.batch(statements);
}

async function queueCalendarHold(env, accountId, inquiryId, userId, payload) {
  const integration = await createDefaultIntegration(env, accountId, userId, "calendar");
  const syncId = `sync_${crypto.randomUUID()}`;
  const externalId = `calendar_hold_${payload.visitId}`;
  await run(env, `
    INSERT INTO sync_events (id, integration_id, inquiry_id, status, operation, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [syncId, integration.id, inquiryId, "queued", "calendar_hold", externalId]);
  return { id: syncId, provider: "calendar", externalId, status: "queued" };
}

async function completeVisitIfReady(env, visitId) {
  const open = await first(env, "SELECT COUNT(*) AS count FROM checklist_items WHERE site_visit_id = ? AND status = 'open'", [visitId]);
  if (Number(open?.count || 0) === 0) {
    await run(env, "UPDATE site_visits SET status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'cancelled'", [visitId]);
  }
}

async function createDeliveryAttempt(env, communicationId, payload) {
  const latest = await first(env, "SELECT MAX(attempt_number) AS attempt FROM communication_delivery_attempts WHERE communication_id = ?", [communicationId]);
  const id = `delivery_${crypto.randomUUID()}`;
  const attempt = Number(latest?.attempt || 0) + 1;
  await run(env, `
    INSERT INTO communication_delivery_attempts (
      id, communication_id, provider, status, attempt_number, request_json,
      response_json, error_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    communicationId,
    payload.provider,
    payload.status,
    attempt,
    JSON.stringify(payload.request || {}),
    JSON.stringify(payload.response || {}),
    payload.errorMessage || null
  ]);
  return {
    id,
    communicationId,
    provider: payload.provider,
    status: payload.status,
    attemptNumber: attempt,
    errorMessage: payload.errorMessage || null
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

async function upsertExtractedField(env, inquiryId, key, label, value, confidenceScore = 100) {
  if (value === null || value === undefined || value === "") return;
  const existing = await first(env, "SELECT id FROM extracted_fields WHERE inquiry_id = ? AND field_key = ? LIMIT 1", [inquiryId, key]);
  if (existing?.id) {
    await run(env, `
      UPDATE extracted_fields
      SET label = ?, value_text = ?, confidence_score = ?, is_verified = 1, verified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [label, value, confidenceScore, existing.id]);
    return existing.id;
  }
  const id = `field_${crypto.randomUUID()}`;
  await run(env, `
    INSERT INTO extracted_fields (id, inquiry_id, field_key, label, value_text, confidence_score, is_verified, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [id, inquiryId, key, label, value, confidenceScore, 1]);
  return id;
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

function communicationChannel(channel) {
  const normalized = String(channel || "internal_note").toLowerCase();
  if (["email", "phone", "text", "internal_note"].includes(normalized)) return normalized;
  if (normalized === "manual" || normalized === "photo" || normalized === "web") return "internal_note";
  return "internal_note";
}

function channelLabel(channel) {
  return {
    email: "email",
    phone: "call note",
    text: "text message",
    internal_note: "internal note"
  }[channel] || "communication";
}

function communicationWebhook(env, channel) {
  if (channel === "email") return env.EMAIL_PROVIDER_WEBHOOK || env.COMMUNICATION_PROVIDER_WEBHOOK || "";
  if (channel === "text") return env.SMS_PROVIDER_WEBHOOK || env.COMMUNICATION_PROVIDER_WEBHOOK || "";
  return "";
}

function defaultSiteVisitStart() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  date.setUTCHours(14, 0, 0, 0);
  return date.toISOString();
}

function addHours(value, hours) {
  const date = new Date(value);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function defaultChecklistLabels() {
  return [
    "Confirm site access window",
    "Capture room and equipment photos",
    "Validate rack and equipment inventory",
    "Confirm electrical disconnect and utility shutoff",
    "Document escort, security, and loading dock requirements"
  ];
}

function normalizeEstimateLines(lines, lowCents) {
  const fallback = [
    { lineType: "labor", description: "Labor", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * 0.42) },
    { lineType: "logistics", description: "Logistics", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * 0.18) },
    { lineType: "recycling", description: "Recycling", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * 0.16) },
    { lineType: "contingency", description: "Contingency", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * 0.1) }
  ];
  const source = Array.isArray(lines) && lines.length ? lines : fallback;
  return source.slice(0, 24).map((line) => ({
    lineType: estimateLineType(line.lineType),
    description: String(line.description || "Estimate line item").slice(0, 240),
    quantity: Number(line.quantity || 1),
    unit: String(line.unit || "each").slice(0, 40),
    unitCostCents: Math.round(Number(line.unitCostCents || 0))
  })).filter((line) => Number.isFinite(line.quantity) && Number.isFinite(line.unitCostCents) && line.unitCostCents >= 0);
}

function estimateLineType(type) {
  const normalized = String(type || "other").toLowerCase();
  return ["labor", "logistics", "recycling", "equipment", "subcontractor", "contingency", "other"].includes(normalized) ? normalized : "other";
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
