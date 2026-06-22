import { and, asc, count, desc, eq, inArray, like, max, ne, or } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  activityEvents, aiRuns, aiSummaries, auditLog, checklistItems, communicationDeliveryAttempts,
  communications, companies, contacts, documents, documentVersions, estimateLines, estimates,
  extractedFields, files, inquiries, inquirySources, integrationConnections, missingRequirements,
  proposals, proposalSections, sites, siteVisits, syncEvents, userPreferences, users
} from "../../db/drizzle-schema.js";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;

export async function listInquiries(env, accountId, filters = {}) {
  const db = getDb(env);
  const predicates = [eq(inquiries.accountId, accountId)];
  if (filters.status) predicates.push(eq(inquiries.status, filters.status));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    predicates.push(or(like(inquiries.title, pattern), like(companies.name, pattern), like(sites.city, pattern), like(inquiries.serviceType, pattern)));
  }
  const rows = await db.select({
    id: inquiries.id, title: inquiries.title, service_type: inquiries.serviceType, priority: inquiries.priority,
    workload: inquiries.workload, status: inquiries.status, estimated_low_cents: inquiries.estimatedLowCents,
    estimated_high_cents: inquiries.estimatedHighCents, confidence_score: inquiries.confidenceScore,
    lease_end_date: inquiries.leaseEndDate, requested_due_date: inquiries.requestedDueDate,
    last_customer_activity_at: inquiries.lastCustomerActivityAt, received_at: inquiries.receivedAt, company_name: companies.name,
    contact_name: contacts.fullName, contact_email: contacts.email, contact_phone: contacts.phone,
    city: sites.city, region: sites.region, missing_count: count(missingRequirements.id)
  }).from(inquiries)
    .leftJoin(companies, eq(companies.id, inquiries.companyId))
    .leftJoin(contacts, eq(contacts.id, inquiries.contactId))
    .leftJoin(sites, eq(sites.id, inquiries.siteId))
    .leftJoin(missingRequirements, and(eq(missingRequirements.inquiryId, inquiries.id), inArray(missingRequirements.status, ["open", "requested"])))
    .where(and(...predicates)).groupBy(inquiries.id).orderBy(desc(inquiries.receivedAt));
  const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
  return rows.sort((a, b) => (priority[a.priority] ?? 4) - (priority[b.priority] ?? 4));
}

export async function getInquiryDetail(env, accountId, inquiryId) {
  const db = getDb(env);
  const [row] = await db.select({ inquiry: inquiries, company_name: companies.name, website: companies.website, contact_name: contacts.fullName, contact_email: contacts.email, contact_phone: contacts.phone, site_name: sites.name, city: sites.city, region: sites.region, access_notes: sites.accessNotes })
    .from(inquiries).leftJoin(companies, eq(companies.id, inquiries.companyId)).leftJoin(contacts, eq(contacts.id, inquiries.contactId)).leftJoin(sites, eq(sites.id, inquiries.siteId))
    .where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!row) return null;
  const inquiry = { ...snake(row.inquiry), company_name: row.company_name, website: row.website, contact_name: row.contact_name, contact_email: row.contact_email, contact_phone: row.contact_phone, site_name: row.site_name, city: row.city, region: row.region, access_notes: row.access_notes };
  const [fieldRows, missingRows, summaryRows, activityRows, documentRows, fileRows, communicationRows, visitRows] = await Promise.all([
    db.select().from(extractedFields).where(eq(extractedFields.inquiryId, inquiryId)).orderBy(asc(extractedFields.fieldKey)),
    db.select().from(missingRequirements).where(eq(missingRequirements.inquiryId, inquiryId)).orderBy(desc(missingRequirements.severity), asc(missingRequirements.category), asc(missingRequirements.label)),
    db.select().from(aiSummaries).where(eq(aiSummaries.inquiryId, inquiryId)).orderBy(desc(aiSummaries.generatedAt)),
    db.select().from(activityEvents).where(eq(activityEvents.inquiryId, inquiryId)).orderBy(desc(activityEvents.createdAt)).limit(25),
    db.select({ document: documents, version_id: documentVersions.id, subject: documentVersions.subject, body: documentVersions.body, metadata_json: documentVersions.metadataJson, generated_by_ai: documentVersions.generatedByAi, version_created_at: documentVersions.createdAt }).from(documents).leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion))).where(eq(documents.inquiryId, inquiryId)).orderBy(desc(documents.updatedAt)),
    db.select().from(files).where(eq(files.inquiryId, inquiryId)).orderBy(desc(files.uploadedAt)),
    listCommunications(env, accountId, inquiryId),
    listSiteVisits(env, accountId, inquiryId)
  ]);
  return {
    inquiry,
    fields: fieldRows.map(snake), missing: missingRows.map(snake), summaries: summaryRows.map(snake), activity: activityRows.map(snake),
    documents: documentRows.map((entry) => ({ ...snake(entry.document), version_id: entry.version_id, subject: entry.subject, body: entry.body, metadata_json: entry.metadata_json, generated_by_ai: entry.generated_by_ai ? 1 : 0, version_created_at: entry.version_created_at })),
    files: fileRows.map(snake), communications: communicationRows, siteVisits: visitRows
  };
}

export async function deleteInquiry(env, accountId, inquiryId) {
  const db = getDb(env);
  const [inquiry] = await db.select().from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;

  const [fileRows, missingRows, documentRows, proposalRows, estimateRows, communicationRows, visitRows] = await Promise.all([
    db.select({ id: files.id, storageKey: files.storageKey }).from(files).where(eq(files.inquiryId, inquiryId)),
    db.select({ id: missingRequirements.id }).from(missingRequirements).where(eq(missingRequirements.inquiryId, inquiryId)),
    db.select({ id: documents.id }).from(documents).where(eq(documents.inquiryId, inquiryId)),
    db.select({ id: proposals.id }).from(proposals).where(eq(proposals.inquiryId, inquiryId)),
    db.select({ id: estimates.id }).from(estimates).where(eq(estimates.inquiryId, inquiryId)),
    db.select({ id: communications.id }).from(communications).where(eq(communications.inquiryId, inquiryId)),
    db.select({ id: siteVisits.id }).from(siteVisits).where(eq(siteVisits.inquiryId, inquiryId))
  ]);
  const visitIds = visitRows.map((row) => row.id);
  const checklistRows = visitIds.length ? await db.select({ id: checklistItems.id }).from(checklistItems).where(inArray(checklistItems.siteVisitId, visitIds)) : [];
  const auditedEntityIds = [inquiryId, ...missingRows, ...documentRows, ...proposalRows, ...estimateRows, ...communicationRows, ...visitRows, ...checklistRows].map((row) => typeof row === "string" ? row : row.id);

  if (fileRows.length) {
    if (!env?.FILES?.delete) throw new Error("File storage deletion is not available.");
    await Promise.all(fileRows.map((file) => env.FILES.delete(file.storageKey)));
  }

  await db.transaction(async (tx) => {
    await tx.delete(aiRuns).where(eq(aiRuns.inquiryId, inquiryId));
    await tx.delete(syncEvents).where(eq(syncEvents.inquiryId, inquiryId));
    if (auditedEntityIds.length) await tx.delete(auditLog).where(and(eq(auditLog.accountId, accountId), inArray(auditLog.entityId, auditedEntityIds)));
    await tx.delete(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId)));
  });

  return { id: inquiryId, title: inquiry.title, deletedFiles: fileRows.length };
}

export async function getTodayWorkspace(env, accountId, userId, selectedDate, timezone) {
  const db = getDb(env);
  const inquiryRows = (await listInquiries(env, accountId)).filter((row) => !["won", "lost", "archived"].includes(row.status));
  const [visitRows, documentRows, communicationRows] = await Promise.all([
    db.select({ visit: siteVisits, inquiry_title: inquiries.title, company_name: companies.name, city: sites.city, region: sites.region })
      .from(siteVisits).innerJoin(inquiries, eq(inquiries.id, siteVisits.inquiryId))
      .leftJoin(companies, eq(companies.id, inquiries.companyId)).leftJoin(sites, eq(sites.id, inquiries.siteId))
      .where(eq(inquiries.accountId, accountId)),
    db.select({ id: documents.id, inquiry_id: documents.inquiryId, document_type: documents.documentType, status: documents.status, updated_at: documents.updatedAt })
      .from(documents).innerJoin(inquiries, eq(inquiries.id, documents.inquiryId))
      .where(and(eq(inquiries.accountId, accountId), eq(documents.documentType, "proposal"))).orderBy(desc(documents.updatedAt)),
    db.select({ inquiry_id: communications.inquiryId, direction: communications.direction, occurred_at: communications.occurredAt })
      .from(communications).innerJoin(inquiries, eq(inquiries.id, communications.inquiryId))
      .where(eq(inquiries.accountId, accountId)).orderBy(desc(communications.occurredAt))
  ]);

  const latestOutbound = new Map();
  for (const communication of communicationRows) {
    if (communication.direction === "outbound" && !latestOutbound.has(communication.inquiry_id)) latestOutbound.set(communication.inquiry_id, communication.occurred_at);
  }
  const latestProposal = new Map();
  for (const document of documentRows) if (!latestProposal.has(document.inquiry_id)) latestProposal.set(document.inquiry_id, document);
  const activeVisit = new Map();
  for (const row of visitRows) if (!["complete", "cancelled"].includes(row.visit.status) && !activeVisit.has(row.visit.inquiryId)) activeVisit.set(row.visit.inquiryId, row);

  const actions = [];
  for (const inquiry of inquiryRows) {
    if (inquiry.status === "needs_info" && Number(inquiry.missing_count) > 0) {
      const outboundAt = latestOutbound.get(inquiry.id);
      const waitingSince = outboundAt || inquiry.last_customer_activity_at || inquiry.received_at;
      const days = ageInDays(waitingSince);
      if (!outboundAt || dateKey(outboundAt, timezone) !== dateKey(now(), timezone)) actions.push({
        id: `follow_up:${inquiry.id}`, type: "follow_up", inquiryId: inquiry.id, title: "Send missing-info reminder",
        company: inquiry.company_name || inquiry.title, detail: `${Number(inquiry.missing_count)} details missing`,
        meta: days === 0 ? "Updated today" : `Waiting ${days} ${days === 1 ? "day" : "days"}`,
        buttonLabel: "Send", screen: "email", tone: days >= 2 ? "urgent" : "default"
      });
    }

    const proposal = latestProposal.get(inquiry.id);
    if (["proposal", "review"].includes(inquiry.status) || (proposal && ["draft", "review"].includes(proposal.status))) {
      actions.push({
        id: `proposal:${inquiry.id}`, type: "proposal", inquiryId: inquiry.id, documentId: proposal?.id || null,
        title: inquiry.status === "review" || proposal?.status === "review" ? "Review proposal" : "Finish proposal",
        company: inquiry.company_name || inquiry.title, detail: inquiry.status === "review" ? "Internal review requested" : "Draft ready to continue",
        meta: dueLabel(inquiry.requested_due_date, selectedDate), buttonLabel: "Review", screen: "proposal", tone: "due"
      });
    }

    if (inquiry.status === "site_visit") {
      const visit = activeVisit.get(inquiry.id)?.visit;
      if (!visit || visit.status === "needed") {
        const start = visit?.scheduledStart || localScheduleIso(selectedDate, 11, 30, timezone);
        actions.push({
          id: `site_visit:${inquiry.id}`, type: "site_visit", inquiryId: inquiry.id, visitId: visit?.id || null,
          title: "Confirm site visit", company: inquiry.company_name || inquiry.title,
          detail: [inquiry.city, inquiry.region].filter(Boolean).join(", ") || "Location pending",
          meta: `Proposed ${formatTime(start, timezone)}`, buttonLabel: "Confirm", screen: "detail", tone: "ready",
          payload: { scheduledStart: start, scheduledEnd: addHours(start, 1), notes: "Confirmed from the Today schedule." }
        });
      }
    }
  }

  const events = visitRows
    .filter(({ visit }) => visit.scheduledStart && !["cancelled", "complete"].includes(visit.status) && dateKey(visit.scheduledStart, timezone) === selectedDate)
    .map(({ visit, inquiry_title, company_name, city, region }) => ({
      id: `visit:${visit.id}`, kind: "site_visit", inquiryId: visit.inquiryId, visitId: visit.id,
      title: "Site visit", company: company_name || inquiry_title, detail: [city, region].filter(Boolean).join(", ") || "Location pending",
      startMinutes: minutesInDay(visit.scheduledStart, timezone), endMinutes: minutesInDay(visit.scheduledEnd || addHours(visit.scheduledStart, 1), timezone),
      screen: "detail", status: visit.status, source: "calendar"
    }));

  if (selectedDate === dateKey(now(), timezone)) {
    const followUp = actions.find((action) => action.type === "follow_up");
    const proposal = actions.find((action) => action.type === "proposal");
    const visitAction = actions.find((action) => action.type === "site_visit");
    if (followUp) events.push(workflowEvent(followUp, "Customer follow-up", 9 * 60, 30));
    if (!events.some((event) => event.kind === "site_visit") && visitAction) events.push(workflowEvent(visitAction, "Site visit", 11 * 60 + 30, 60));
    if (proposal) events.push(workflowEvent(proposal, "Proposal review", 14 * 60, 60));
  }

  events.sort((a, b) => a.startMinutes - b.startMinutes);
  actions.sort((a, b) => ({ urgent: 0, due: 1, ready: 2, default: 3 })[a.tone] - ({ urgent: 0, due: 1, ready: 2, default: 3 })[b.tone]);
  return { date: selectedDate, timezone, events, actions: actions.slice(0, 6), generatedAt: now() };
}

export async function createActivity(env, accountId, inquiryId, actorUserId, eventType, summary, metadata = {}) {
  const eventId = id("evt");
  await getDb(env).insert(activityEvents).values({ id: eventId, accountId, inquiryId, actorUserId, eventType, summary, metadataJson: JSON.stringify(metadata) });
  return { id: eventId };
}

export async function createAuditLog(env, accountId, actorUserId, entityType, entityId, action, before = null, after = null) {
  const auditId = id("audit");
  await getDb(env).insert(auditLog).values({ id: auditId, accountId, actorUserId, entityType, entityId, action, beforeJson: before ? JSON.stringify(before) : null, afterJson: after ? JSON.stringify(after) : null });
  return { id: auditId };
}

export async function getUserPreferences(env, userId) {
  const [row] = await getDb(env).select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return row ? snake(row) : null;
}

export async function updateUserPreferences(env, accountId, userId, payload) {
  const before = await getUserPreferences(env, userId);
  const settings = { highPriorityAlerts: Boolean(payload.highPriorityAlerts), leaseDeadlineReminders: Boolean(payload.leaseDeadlineReminders), dailyDigest: Boolean(payload.dailyDigest) };
  const priorSettings = safeJson(before?.settings_json) || {};
  await getDb(env).update(userPreferences).set({ notificationDigest: settings.dailyDigest ? "daily" : "none", settingsJson: JSON.stringify({ ...priorSettings, ...settings }), updatedAt: now() }).where(eq(userPreferences.userId, userId));
  const after = await getUserPreferences(env, userId);
  await createAuditLog(env, accountId, userId, "user_preferences", userId, "preferences.updated", before, after);
  return after;
}

export async function updateUserProfile(env, accountId, userId, payload) {
  const db = getDb(env);
  const [before] = await db.select().from(users).where(and(eq(users.accountId, accountId), eq(users.id, userId))).limit(1);
  if (!before) return null;
  await db.update(users).set({ fullName: String(payload.fullName || before.fullName).trim() || before.fullName, avatarUrl: payload.avatarUrl === undefined ? before.avatarUrl : payload.avatarUrl || null, updatedAt: now() }).where(eq(users.id, userId));
  const [after] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await createAuditLog(env, accountId, userId, "user", userId, "profile.updated", snake(before), snake(after));
  return snake(after);
}

export async function listIntegrations(env, accountId) {
  return (await getDb(env).select().from(integrationConnections).where(eq(integrationConnections.accountId, accountId)).orderBy(asc(integrationConnections.provider), asc(integrationConnections.displayName))).map(snake);
}

export async function upsertIntegration(env, accountId, userId, provider) {
  const db = getDb(env);
  const displayName = integrationDisplayName(provider);
  const [existing] = await db.select().from(integrationConnections).where(and(eq(integrationConnections.accountId, accountId), eq(integrationConnections.provider, provider), eq(integrationConnections.displayName, displayName))).limit(1);
  const metadataJson = JSON.stringify({ connectedBy: userId, mode: "demo-ready", note: "Connection placeholder persisted. Add provider credentials in production deployment." });
  if (existing) {
    await db.update(integrationConnections).set({ status: "connected", metadataJson, updatedAt: now() }).where(eq(integrationConnections.id, existing.id));
    await createAuditLog(env, accountId, userId, "integration_connection", existing.id, "integration.connected", snake(existing), { ...snake(existing), status: "connected", metadata_json: metadataJson });
    return { id: existing.id, provider, displayName, status: "connected" };
  }
  const integrationId = id("int");
  await db.insert(integrationConnections).values({ id: integrationId, accountId, provider, displayName, status: "connected", metadataJson });
  await createAuditLog(env, accountId, userId, "integration_connection", integrationId, "integration.connected", null, { provider, displayName, status: "connected" });
  return { id: integrationId, provider, displayName, status: "connected" };
}

export async function syncInquiry(env, accountId, inquiryId, userId, provider = "crm") {
  const db = getDb(env);
  let [integration] = await db.select({ id: integrationConnections.id }).from(integrationConnections).where(and(eq(integrationConnections.accountId, accountId), eq(integrationConnections.provider, provider), eq(integrationConnections.status, "connected"))).limit(1);
  if (!integration) integration = await createDefaultIntegration(env, accountId, userId, provider);
  const [inquiry] = await db.select({ id: inquiries.id, title: inquiries.title }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;
  const syncId = id("sync");
  const externalId = `${provider}_${inquiryId}`;
  await db.insert(syncEvents).values({ id: syncId, integrationId: integration.id, inquiryId, status: "success", operation: "upsert_opportunity", externalId });
  await createActivity(env, accountId, inquiryId, userId, "integration.synced", `Synced ${inquiry.title} to ${provider.toUpperCase()}`, { syncId, provider, externalId });
  await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "integration.synced", null, { provider, externalId });
  return { id: syncId, provider, externalId, status: "success" };
}

export async function updateInquiryStatus(env, accountId, inquiryId, userId, status) {
  const db = getDb(env);
  const [before] = await db.select({ id: inquiries.id, status: inquiries.status, title: inquiries.title }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!before) return null;
  await db.update(inquiries).set({ status, updatedAt: now() }).where(eq(inquiries.id, inquiryId));
  const after = { ...before, status };
  await createActivity(env, accountId, inquiryId, userId, "inquiry.status_updated", `Moved ${before.title} to ${status}`, { from: before.status, to: status });
  await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "status.updated", before, after);
  return after;
}

export async function updateMissingRequirement(env, accountId, requirementId, userId, status) {
  const db = getDb(env);
  const [before] = await db.select({ requirement: missingRequirements, accountId: inquiries.accountId, title: inquiries.title }).from(missingRequirements).innerJoin(inquiries, eq(inquiries.id, missingRequirements.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(missingRequirements.id, requirementId))).limit(1);
  if (!before) return null;
  await db.update(missingRequirements).set({ status, resolvedAt: ["received", "waived"].includes(status) ? now() : before.requirement.resolvedAt }).where(eq(missingRequirements.id, requirementId));
  const prior = snake(before.requirement);
  const after = { ...prior, status };
  await createActivity(env, accountId, before.requirement.inquiryId, userId, "missing_requirement.updated", `${before.requirement.label} marked ${status}`, { requirementId, from: before.requirement.status, to: status });
  await createAuditLog(env, accountId, userId, "missing_requirement", requirementId, "status.updated", prior, after);
  return after;
}

export async function updateInquiryDetails(env, accountId, inquiryId, userId, payload) {
  const db = getDb(env);
  const [before] = await db.select({ inquiry: inquiries, contact: contacts, site: sites }).from(inquiries).leftJoin(contacts, eq(contacts.id, inquiries.contactId)).leftJoin(sites, eq(sites.id, inquiries.siteId)).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!before) return null;
  const contactName = String(payload.contact || before.contact?.fullName || "Unknown Contact").trim() || "Unknown Contact";
  const email = String(payload.email || before.contact?.email || "").trim() || null;
  const phone = String(payload.phone || before.contact?.phone || "").trim() || null;
  const accessNotes = String(payload.accessNotes || before.site?.accessNotes || "").trim() || null;
  if (before.contact?.id) await db.update(contacts).set({ fullName: contactName, email, phone, updatedAt: now() }).where(eq(contacts.id, before.contact.id));
  if (before.site?.id) await db.update(sites).set({ accessNotes, updatedAt: now() }).where(eq(sites.id, before.site.id));
  await db.update(inquiries).set({ updatedAt: now() }).where(eq(inquiries.id, inquiryId));
  await upsertExtractedField(env, inquiryId, "contact_name", "Contact", contactName);
  await upsertExtractedField(env, inquiryId, "contact_email", "Email", email);
  await upsertExtractedField(env, inquiryId, "contact_phone", "Phone", phone);
  await upsertExtractedField(env, inquiryId, "access_requirements", "Site access requirements", accessNotes);
  const after = { id: inquiryId, title: before.inquiry.title, contact_id: before.contact?.id || null, site_id: before.site?.id || null, full_name: contactName, email, phone, access_notes: accessNotes };
  await createActivity(env, accountId, inquiryId, userId, "inquiry.details_updated", `Updated extracted details for ${before.inquiry.title}`, { contactName, email, phone, accessNotes });
  await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "details.updated", { ...snake(before.inquiry), ...snake(before.contact || {}), access_notes: before.site?.accessNotes }, after);
  return after;
}

export async function createInquiry(env, accountId, userId, payload) {
  const db = getDb(env);
  const inquiryId = id("inq"), companyId = id("co"), contactId = id("ct"), siteId = id("site"), sourceId = id("src");
  const company = payload.company || "Unknown Company";
  const location = payload.location || {};
  await db.insert(companies).values({ id: companyId, accountId, name: company, website: payload.website || null, industry: payload.industry || null });
  await db.insert(contacts).values({ id: contactId, accountId, companyId, fullName: payload.contact?.fullName || "Unknown Contact", title: payload.contact?.title || null, email: payload.contact?.email || null, phone: payload.contact?.phone || null, preferredChannel: payload.sourceChannel || "unknown" });
  await db.insert(sites).values({ id: siteId, accountId, companyId, name: payload.siteName || `${company} Site`, city: location.city || null, region: location.region || null, country: location.country || "US", siteType: payload.siteType || "unknown", accessNotes: payload.accessNotes || null });
  await db.insert(inquiries).values({ id: inquiryId, accountId, companyId, contactId, siteId, ownerUserId: userId, title: payload.title || `${company} Inquiry`, serviceType: payload.serviceType || "other", sourceChannel: payload.sourceChannel || "manual", priority: payload.priority || "medium", workload: payload.workload || "medium", status: "new", confidenceScore: payload.confidenceScore || 0, leaseEndDate: payload.leaseEndDate || null, receivedAt: now(), lastCustomerActivityAt: now(), createdAt: now(), updatedAt: now() });
  await db.insert(inquirySources).values({ id: sourceId, inquiryId, channel: payload.sourceChannel || "manual", subject: payload.subject || null, sender: payload.sender || null, rawText: payload.rawText || "", capturedByUserId: userId, capturedAt: now() });
  await db.insert(communications).values({ id: id("comm"), inquiryId, contactId, direction: "inbound", channel: communicationChannel(payload.sourceChannel), subject: payload.subject || null, body: payload.rawText || "", status: "received", externalMessageId: payload.externalMessageId || null, createdByUserId: userId, occurredAt: now() });
  await createActivity(env, accountId, inquiryId, userId, "inquiry.created", `Created inquiry ${payload.title || company}`, { sourceId });
  return { id: inquiryId, companyId, contactId, siteId, sourceId };
}

export async function createInquiryFromExtraction(env, accountId, userId, payload, analysis) {
  const db = getDb(env);
  const extraction = analysis.extraction;
  const companyId = await findOrCreateCompany(env, accountId, extraction.company);
  const contactId = id("ct"), siteId = id("site"), inquiryId = id("inq"), sourceId = id("src"), summaryId = id("sum");
  const titleLocation = [extraction.site.city, extraction.site.region].filter(Boolean).join(", ");
  const title = `${extraction.company.name}${titleLocation ? ` - ${titleLocation}` : ""}`;
  const status = extraction.missingRequirements.length ? "needs_info" : "estimating";
  await db.insert(contacts).values({ id: contactId, accountId, companyId, fullName: extraction.contact.fullName, email: extraction.contact.email, phone: extraction.contact.phone, preferredChannel: extraction.contact.preferredChannel });
  await db.insert(sites).values({ id: siteId, accountId, companyId, name: extraction.site.name, city: extraction.site.city, region: extraction.site.region, country: extraction.site.country, siteType: extraction.site.siteType, accessNotes: extraction.site.accessNotes });
  await db.insert(inquiries).values({ id: inquiryId, accountId, companyId, contactId, siteId, ownerUserId: userId, title, serviceType: extraction.service.type, sourceChannel: payload.sourceChannel || "manual", priority: extraction.priority, workload: extraction.workload, status, estimatedLowCents: extraction.estimateRange.lowCents, estimatedHighCents: extraction.estimateRange.highCents, confidenceScore: extraction.confidenceScore, leaseEndDate: extraction.timeline.leaseEndDate, requestedDueDate: extraction.timeline.requestedDueDate, receivedAt: now(), lastCustomerActivityAt: now(), createdAt: now(), updatedAt: now() });
  await db.insert(inquirySources).values({ id: sourceId, inquiryId, channel: payload.sourceChannel || "manual", subject: payload.subject || "AI intake source", sender: payload.sender || extraction.contact.email || extraction.contact.phone || extraction.contact.fullName, rawText: payload.rawText, capturedByUserId: userId, capturedAt: now() });
  await db.insert(communications).values({ id: id("comm"), inquiryId, contactId, direction: "inbound", channel: communicationChannel(payload.sourceChannel), subject: payload.subject || "AI intake source", body: payload.rawText, status: "received", externalMessageId: payload.externalMessageId || null, createdByUserId: userId, occurredAt: now() });
  await db.insert(aiSummaries).values({ id: summaryId, inquiryId, summaryType: "intake", body: extraction.summary, modelName: analysis.model, confidenceScore: extraction.confidenceScore, generatedByUserId: userId, generatedAt: now() });
  await persistExtractedFields(env, inquiryId, sourceId, extraction);
  await persistMissingRequirements(env, inquiryId, extraction.missingRequirements);
  const aiRun = await recordAiRun(env, accountId, inquiryId, userId, { runType: "intake_extraction", provider: analysis.mode === "live" ? "openai" : "local", modelName: analysis.model, status: analysis.mode === "live" ? "success" : "fallback", inputPreview: payload.rawText, output: extraction, errorMessage: analysis.error || null, latencyMs: analysis.latencyMs || null });
  await createActivity(env, accountId, inquiryId, userId, "ai.intake_extracted", `${analysis.mode === "live" ? "AI" : "Fallback AI"} created structured intake for ${title}`, { aiRunId: aiRun.id, missingCount: extraction.missingRequirements.length });
  return { id: inquiryId, companyId, contactId, siteId, sourceId, aiRunId: aiRun.id, status, missingCount: extraction.missingRequirements.length };
}

export async function recordAiRun(env, accountId, inquiryId, userId, run) {
  const runId = id("airun");
  await getDb(env).insert(aiRuns).values({ id: runId, accountId, inquiryId: inquiryId || null, runType: run.runType, provider: run.provider || "openai", modelName: run.modelName || null, status: run.status, inputPreview: String(run.inputPreview || "").slice(0, 1200), outputJson: JSON.stringify(run.output || {}), errorMessage: run.errorMessage || null, latencyMs: run.latencyMs || null, createdByUserId: userId });
  return { id: runId };
}

export async function createGeneratedWorkProduct(env, accountId, inquiryId, userId, type, analysis) {
  const db = getDb(env);
  const product = analysis.product;
  const documentId = id("doc"), versionId = id("docver");
  const documentType = normalizeDocumentType(product.documentType || type);
  await db.insert(documents).values({ id: documentId, inquiryId, documentType, title: product.title, status: product.approvalRequired ? "review" : "draft", currentVersion: 1, createdByUserId: userId, createdAt: now(), updatedAt: now() });
  await db.insert(documentVersions).values({ id: versionId, documentId, version: 1, subject: product.subject, body: product.body, metadataJson: JSON.stringify({ confidenceScore: product.confidenceScore, approvalRequired: product.approvalRequired, missingRiskNotes: product.missingRiskNotes, nextActions: product.nextActions, estimate: product.estimate, mode: analysis.mode, model: analysis.model }), generatedByAi: true, createdByUserId: userId, createdAt: now() });
  let estimateId = null;
  if (["estimate", "proposal"].includes(documentType) && product.estimate.lowCents != null && product.estimate.highCents != null) estimateId = await createEstimateRecords(env, inquiryId, userId, product);
  let proposalId = null;
  if (documentType === "proposal") proposalId = await createProposalRecords(env, inquiryId, estimateId, documentId, product);
  if (documentType === "site_checklist") await createSiteVisitRecords(env, inquiryId, userId, product);
  const aiRun = await recordAiRun(env, accountId, inquiryId, userId, { runType: runTypeForDocument(documentType), provider: analysis.mode === "live" ? "openai" : "local", modelName: analysis.model, status: analysis.mode === "live" ? "success" : "fallback", inputPreview: product.title, output: product, errorMessage: analysis.error || null, latencyMs: analysis.latencyMs || null });
  await db.insert(aiSummaries).values({ id: id("sum"), inquiryId, summaryType: documentType === "proposal" ? "proposal" : documentType === "scope_of_work" ? "scope" : "email", body: `Generated ${product.title}. ${product.nextActions.join(" ")}`, modelName: analysis.model, confidenceScore: product.confidenceScore, generatedByUserId: userId });
  await createActivity(env, accountId, inquiryId, userId, `ai.${runTypeForDocument(documentType)}`, `Generated ${product.title}`, { aiRunId: aiRun.id, documentId, versionId, estimateId, proposalId });
  return { documentId, versionId, estimateId, proposalId, aiRunId: aiRun.id, product };
}

export async function saveDocumentDraft(env, accountId, inquiryId, userId, payload) {
  const db = getDb(env);
  const documentType = normalizeDocumentType(payload.documentType || "other");
  const title = payload.title || titleForDocument(documentType);
  const subject = payload.subject || null;
  const body = payload.body || "";
  const metadata = { ...(payload.metadata || {}), manuallyEdited: true, savedBy: userId };
  let document = null;
  if (payload.documentId) {
    [document] = await db.select({ document: documents }).from(documents).innerJoin(inquiries, eq(inquiries.id, documents.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(documents.inquiryId, inquiryId), eq(documents.id, payload.documentId))).limit(1);
    document = document?.document;
  }
  if (!document) {
    const documentId = id("doc"), versionId = id("docver");
    await db.insert(documents).values({ id: documentId, inquiryId, documentType, title, status: "draft", currentVersion: 1, createdByUserId: userId, createdAt: now(), updatedAt: now() });
    await db.insert(documentVersions).values({ id: versionId, documentId, version: 1, subject, body, metadataJson: JSON.stringify(metadata), generatedByAi: false, createdByUserId: userId, createdAt: now() });
    await createActivity(env, accountId, inquiryId, userId, "document.created", `Saved ${title}`, { documentId, versionId, documentType });
    await createAuditLog(env, accountId, userId, "document", documentId, "document.created", null, { documentType, title, version: 1 });
    return { documentId, versionId, documentType, title, subject, body, metadata, currentVersion: 1 };
  }
  const nextVersion = Number(document.currentVersion || 0) + 1;
  const versionId = id("docver");
  await db.insert(documentVersions).values({ id: versionId, documentId: document.id, version: nextVersion, subject, body, metadataJson: JSON.stringify(metadata), generatedByAi: false, createdByUserId: userId, createdAt: now() });
  await db.update(documents).set({ title, status: payload.status || "draft", currentVersion: nextVersion, updatedAt: now() }).where(eq(documents.id, document.id));
  await createActivity(env, accountId, inquiryId, userId, "document.version_saved", `Saved ${title} v${nextVersion}`, { documentId: document.id, versionId, documentType });
  await createAuditLog(env, accountId, userId, "document", document.id, "document.version_saved", { id: document.id, current_version: document.currentVersion, status: document.status }, { id: document.id, current_version: nextVersion, status: payload.status || "draft" });
  return { documentId: document.id, versionId, documentType, title, subject, body, metadata, currentVersion: nextVersion };
}

export async function submitProposalForReview(env, accountId, inquiryId, userId, payload = {}) {
  const db = getDb(env);
  const [inquiry] = await db.select({ id: inquiries.id, title: inquiries.title, status: inquiries.status }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;
  const conditions = [eq(documents.inquiryId, inquiryId), eq(documents.documentType, "proposal")];
  if (payload.documentId) conditions.push(eq(documents.id, payload.documentId));
  const [entry] = await db.select({ document: documents, version: documentVersions }).from(documents).leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion))).where(and(...conditions)).orderBy(desc(documents.updatedAt)).limit(1);
  if (!entry) return null;
  const metadata = safeJson(entry.version?.metadataJson) || {};
  await db.update(documents).set({ status: "review", updatedAt: now() }).where(eq(documents.id, entry.document.id));
  await db.update(inquiries).set({ status: "review", updatedAt: now() }).where(eq(inquiries.id, inquiryId));
  let [proposal] = await db.select().from(proposals).where(eq(proposals.documentId, entry.document.id)).orderBy(desc(proposals.createdAt)).limit(1);
  if (proposal) {
    await db.update(proposals).set({ status: "review", requiresApproval: true, updatedAt: now() }).where(eq(proposals.id, proposal.id));
    [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposal.id)).limit(1);
  } else {
    const proposalId = id("prop");
    await db.insert(proposals).values({ id: proposalId, inquiryId, documentId: entry.document.id, status: "review", priceLowCents: metadata.estimate?.lowCents || null, priceHighCents: metadata.estimate?.highCents || null, requiresApproval: true });
    [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  }
  await createActivity(env, accountId, inquiryId, userId, "proposal.submitted_for_review", `Submitted proposal for ${inquiry.title} to internal review`, { documentId: entry.document.id, versionId: entry.version?.id, proposalId: proposal.id });
  await createAuditLog(env, accountId, userId, "proposal", proposal.id, "proposal.submitted_for_review", { inquiryStatus: inquiry.status, documentStatus: entry.document.status }, { inquiryStatus: "review", documentStatus: "review", proposalStatus: proposal.status });
  return { document: { documentId: entry.document.id, versionId: entry.version?.id, documentType: "proposal", title: entry.document.title, subject: entry.version?.subject || null, body: entry.version?.body || "", metadata, currentVersion: entry.document.currentVersion, status: "review" }, proposal: snake(proposal), inquiry: { ...inquiry, status: "review" } };
}

export async function saveEstimateForInquiry(env, accountId, inquiryId, userId, payload = {}) {
  const db = getDb(env);
  const [inquiry] = await db.select({ id: inquiries.id, title: inquiries.title, status: inquiries.status }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;
  const [{ version: latestVersion }] = await db.select({ version: max(estimates.version) }).from(estimates).where(eq(estimates.inquiryId, inquiryId));
  const version = Number(latestVersion || 0) + 1;
  const estimateId = id("est");
  const lowCents = Math.round(Number(payload.lowCents)), highCents = Math.round(Number(payload.highCents));
  const assumptions = String(payload.assumptions || "Estimate saved from mobile estimate workflow.").slice(0, 2000);
  await db.insert(estimates).values({ id: estimateId, inquiryId, version, status: "approved", lowCents, highCents, assumptions, createdByUserId: userId, approvedAt: now() });
  const lines = normalizeEstimateLines(payload.lineItems, lowCents);
  if (lines.length) await db.insert(estimateLines).values(lines.map((line) => ({ id: id("line"), estimateId, lineType: line.lineType, description: line.description, quantity: line.quantity, unit: line.unit, unitCostCents: line.unitCostCents, totalCents: Math.round(line.quantity * line.unitCostCents) })));
  await db.update(inquiries).set({ estimatedLowCents: lowCents, estimatedHighCents: highCents, status: "estimating", updatedAt: now() }).where(eq(inquiries.id, inquiryId));
  const [estimate] = await db.select().from(estimates).where(eq(estimates.id, estimateId)).limit(1);
  await createActivity(env, accountId, inquiryId, userId, "estimate.saved", `Saved estimate for ${inquiry.title}`, { estimateId, version, lowCents, highCents });
  await createAuditLog(env, accountId, userId, "estimate", estimateId, "estimate.saved", null, snake(estimate));
  return { estimate: snake(estimate), lineItems: lines, inquiry: { ...inquiry, status: "estimating", estimated_low_cents: lowCents, estimated_high_cents: highCents } };
}

export async function listCommunications(env, accountId, inquiryId) {
  const rows = await getDb(env).select({ communication: communications }).from(communications).innerJoin(inquiries, eq(inquiries.id, communications.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(communications.inquiryId, inquiryId))).orderBy(desc(communications.occurredAt));
  return rows.map((row) => snake(row.communication));
}

export async function logCommunication(env, accountId, inquiryId, userId, payload) {
  const db = getDb(env);
  const [inquiry] = await db.select({ id: inquiries.id, title: inquiries.title, contactId: inquiries.contactId }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;
  const direction = payload.direction === "outbound" ? "outbound" : "inbound";
  const channel = communicationChannel(payload.channel);
  const status = payload.status || (direction === "inbound" ? "received" : "draft");
  const communicationId = id("comm");
  const occurredAt = payload.occurredAt || now();
  const value = { id: communicationId, inquiryId, contactId: payload.contactId || inquiry.contactId || null, direction, channel, subject: payload.subject || null, body: payload.body || "", status, externalMessageId: payload.externalMessageId || null, createdByUserId: userId, occurredAt };
  await db.insert(communications).values(value);
  if (direction === "inbound") await db.update(inquiries).set({ lastCustomerActivityAt: occurredAt, updatedAt: now() }).where(eq(inquiries.id, inquiryId));
  await createActivity(env, accountId, inquiryId, userId, `communication.${direction}`, `${direction === "outbound" ? "Prepared" : "Logged"} ${channelLabel(channel)} for ${inquiry.title}`, { communicationId, channel, status });
  await createAuditLog(env, accountId, userId, "communication", communicationId, "communication.logged", null, { inquiryId, direction, channel, status });
  return snake(value);
}

export async function sendOutboundCommunication(env, accountId, inquiryId, userId, payload) {
  const db = getDb(env);
  const [entry] = await db.select({ inquiry: inquiries, contact: contacts }).from(inquiries).leftJoin(contacts, eq(contacts.id, inquiries.contactId)).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!entry) return null;
  const channel = communicationChannel(payload.channel || "email");
  const subject = payload.subject || (channel === "email" ? `Follow-up on ${entry.inquiry.title}` : null);
  const webhook = communicationWebhook(env, channel);
  const communication = await logCommunication(env, accountId, inquiryId, userId, { direction: "outbound", channel, subject, body: String(payload.body || "").trim(), status: "queued" });
  const provider = channel === "text" ? "sms_webhook" : channel === "email" ? "email_webhook" : "manual_log";
  const request = { communicationId: communication.id, inquiryId, to: channel === "text" ? entry.contact?.phone : entry.contact?.email, contactName: entry.contact?.fullName, subject, body: payload.body, metadata: payload.metadata || {} };
  if (!webhook) {
    const delivery = await createDeliveryAttempt(env, communication.id, { provider, status: "queued", request, response: {}, errorMessage: `${channelLabel(channel)} provider webhook is not configured.` });
    await createActivity(env, accountId, inquiryId, userId, "communication.queued", `Queued ${channelLabel(channel)} for provider setup`, { communicationId: communication.id, deliveryId: delivery.id });
    return { communication, delivery };
  }
  try {
    const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    const responseText = await response.text();
    const responseBody = safeJson(responseText) || { body: responseText.slice(0, 1200) };
    const status = response.ok ? "sent" : "failed";
    const externalId = responseBody.id || responseBody.messageId || responseBody.externalMessageId || null;
    await db.update(communications).set({ status, externalMessageId: externalId }).where(eq(communications.id, communication.id));
    const delivery = await createDeliveryAttempt(env, communication.id, { provider, status, request, response: responseBody, errorMessage: response.ok ? null : `Provider returned ${response.status}` });
    return { communication: { ...communication, status, external_message_id: externalId }, delivery };
  } catch (error) {
    await db.update(communications).set({ status: "failed" }).where(eq(communications.id, communication.id));
    const delivery = await createDeliveryAttempt(env, communication.id, { provider, status: "failed", request, response: {}, errorMessage: error.message });
    return { communication: { ...communication, status: "failed" }, delivery };
  }
}

export async function listSiteVisits(env, accountId, inquiryId) {
  const db = getDb(env);
  const visitRows = await db.select({ visit: siteVisits }).from(siteVisits).innerJoin(inquiries, eq(inquiries.id, siteVisits.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(siteVisits.inquiryId, inquiryId))).orderBy(desc(siteVisits.scheduledStart), desc(siteVisits.createdAt));
  if (!visitRows.length) return [];
  const visitIds = visitRows.map((row) => row.visit.id);
  const itemRows = await db.select().from(checklistItems).where(inArray(checklistItems.siteVisitId, visitIds)).orderBy(asc(checklistItems.label));
  const byVisit = new Map(visitRows.map(({ visit }) => [visit.id, { ...snake(visit), checklistItems: [] }]));
  for (const item of itemRows) byVisit.get(item.siteVisitId)?.checklistItems.push(snake(item));
  const priority = { scheduled: 0, needed: 1, complete: 2, cancelled: 3 };
  return [...byVisit.values()].sort((a, b) => (priority[a.status] ?? 4) - (priority[b.status] ?? 4));
}

export async function scheduleSiteVisit(env, accountId, inquiryId, userId, payload = {}) {
  const db = getDb(env);
  const [inquiry] = await db.select({ id: inquiries.id, title: inquiries.title, siteId: inquiries.siteId }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;
  const [existing] = await db.select().from(siteVisits).where(and(eq(siteVisits.inquiryId, inquiryId), inArray(siteVisits.status, ["needed", "scheduled"]))).orderBy(desc(siteVisits.createdAt)).limit(1);
  const scheduledStart = payload.scheduledStart || defaultSiteVisitStart();
  const scheduledEnd = payload.scheduledEnd || addHours(scheduledStart, 1);
  const notes = payload.notes || "Site visit scheduled from mobile workflow.";
  const visitId = existing?.id || id("visit");
  if (existing) await db.update(siteVisits).set({ scheduledStart, scheduledEnd, status: "scheduled", assignedUserId: userId, notes, updatedAt: now() }).where(eq(siteVisits.id, visitId));
  else await db.insert(siteVisits).values({ id: visitId, inquiryId, siteId: inquiry.siteId || null, scheduledStart, scheduledEnd, status: "scheduled", assignedUserId: userId, notes, createdAt: now(), updatedAt: now() });
  await ensureChecklistItems(env, visitId, payload.checklist || defaultChecklistLabels());
  await db.update(inquiries).set({ status: "site_visit", updatedAt: now() }).where(eq(inquiries.id, inquiryId));
  const calendarSync = await queueCalendarHold(env, accountId, inquiryId, userId, { visitId, title: `Site visit: ${inquiry.title}`, scheduledStart, scheduledEnd });
  const [siteVisit] = await db.select().from(siteVisits).where(eq(siteVisits.id, visitId)).limit(1);
  await createActivity(env, accountId, inquiryId, userId, "site_visit.scheduled", `Scheduled site visit for ${inquiry.title}`, { visitId, scheduledStart, scheduledEnd, calendarSyncId: calendarSync.id });
  await createAuditLog(env, accountId, userId, "site_visit", visitId, existing ? "site_visit.rescheduled" : "site_visit.scheduled", existing ? snake(existing) : null, snake(siteVisit));
  return { siteVisit: { ...snake(siteVisit), checklistItems: (await listSiteVisits(env, accountId, inquiryId)).find((visit) => visit.id === visitId)?.checklistItems || [] }, calendarSync };
}

export async function updateChecklistItem(env, accountId, itemId, userId, status, notes = null) {
  const db = getDb(env);
  const [entry] = await db.select({ item: checklistItems, visit: siteVisits, inquiry: inquiries }).from(checklistItems).innerJoin(siteVisits, eq(siteVisits.id, checklistItems.siteVisitId)).innerJoin(inquiries, eq(inquiries.id, siteVisits.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(checklistItems.id, itemId))).limit(1);
  if (!entry) return null;
  await db.update(checklistItems).set({ status, notes: notes ?? entry.item.notes, completedByUserId: status === "done" ? userId : entry.item.completedByUserId, completedAt: status === "done" ? now() : entry.item.completedAt }).where(eq(checklistItems.id, itemId));
  const [after] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
  await createActivity(env, accountId, entry.visit.inquiryId, userId, "checklist_item.updated", `${entry.item.label} marked ${status}`, { checklistItemId: itemId, from: entry.item.status, to: status });
  await createAuditLog(env, accountId, userId, "checklist_item", itemId, "checklist_item.updated", snake(entry.item), snake(after));
  await completeVisitIfReady(env, entry.item.siteVisitId);
  return snake(after);
}

export async function createFileRecord(env, accountId, inquiryId, userId, file) {
  const db = getDb(env);
  const [inquiry] = await db.select({ id: inquiries.id, siteId: inquiries.siteId }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;
  const fileId = id("file");
  await db.insert(files).values({ id: fileId, inquiryId, siteId: inquiry.siteId || null, fileName: file.fileName, contentType: file.contentType, storageKey: file.storageKey, sizeBytes: file.sizeBytes, category: file.category, uploadedByUserId: userId });
  await createActivity(env, accountId, inquiryId, userId, "file.uploaded", `Uploaded ${file.fileName}`, { fileId, category: file.category, sizeBytes: file.sizeBytes });
  return { id: fileId, ...file };
}

export async function listFilesForInquiry(env, accountId, inquiryId) {
  const rows = await getDb(env).select({ file: files }).from(files).innerJoin(inquiries, eq(inquiries.id, files.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(files.inquiryId, inquiryId))).orderBy(desc(files.uploadedAt));
  return rows.map(({ file }) => snake(file));
}

export async function getFileForDownload(env, accountId, fileId) {
  const [row] = await getDb(env).select({ file: files }).from(files).innerJoin(inquiries, eq(inquiries.id, files.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(files.id, fileId))).limit(1);
  return row ? snake(row.file) : null;
}

async function findOrCreateCompany(env, accountId, company) {
  const db = getDb(env);
  const [existing] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.accountId, accountId), eq(companies.name, company.name))).limit(1);
  if (existing) return existing.id;
  const companyId = id("co");
  await db.insert(companies).values({ id: companyId, accountId, name: company.name, website: company.website || null, industry: company.industry || null });
  return companyId;
}

async function persistExtractedFields(env, inquiryId, sourceId, extraction) {
  const values = [
    ["company_name", "Company", extraction.company.name], ["contact_name", "Contact", extraction.contact.fullName], ["contact_email", "Email", extraction.contact.email], ["contact_phone", "Phone", extraction.contact.phone], ["site_city", "City", extraction.site.city], ["site_region", "Region", extraction.site.region], ["service_type", "Service", extraction.service.label], ["lease_end_date", "Lease expiration date", extraction.timeline.leaseEndDate], ["requested_due_date", "Requested due date", extraction.timeline.requestedDueDate], ["access_requirements", "Site access requirements", extraction.site.accessNotes], ["rack_count", "Rack count", extraction.equipment.rackCount == null ? null : String(extraction.equipment.rackCount)], ["equipment_assets", "Equipment", extraction.equipment.assets.join(", ") || null], ["estimate_range", "Estimate range", centsRange(extraction.estimateRange.lowCents, extraction.estimateRange.highCents)]
  ].filter(([, , value]) => value !== null && value !== undefined && value !== "");
  if (values.length) await getDb(env).insert(extractedFields).values(values.map(([fieldKey, label, valueText]) => ({ id: id("field"), inquiryId, fieldKey, label, valueText, confidenceScore: extraction.confidenceScore, sourceId }))).onConflictDoNothing();
}

async function upsertExtractedField(env, inquiryId, fieldKey, label, valueText, confidenceScore = 100) {
  if (valueText === null || valueText === undefined || valueText === "") return;
  const db = getDb(env);
  const [existing] = await db.select({ id: extractedFields.id }).from(extractedFields).where(and(eq(extractedFields.inquiryId, inquiryId), eq(extractedFields.fieldKey, fieldKey))).limit(1);
  if (existing) {
    await db.update(extractedFields).set({ label, valueText, confidenceScore, isVerified: true, verifiedAt: now() }).where(eq(extractedFields.id, existing.id));
    return existing.id;
  }
  const fieldId = id("field");
  await db.insert(extractedFields).values({ id: fieldId, inquiryId, fieldKey, label, valueText, confidenceScore, isVerified: true, verifiedAt: now() });
  return fieldId;
}

async function persistMissingRequirements(env, inquiryId, requirements) {
  if (requirements.length) await getDb(env).insert(missingRequirements).values(requirements.map((item) => ({ id: id("miss"), inquiryId, requirementKey: item.key, label: item.label, category: item.category, severity: item.severity, status: "open", notes: item.reason }))).onConflictDoNothing();
}

async function createEstimateRecords(env, inquiryId, userId, product) {
  const db = getDb(env);
  const [{ version: latestVersion }] = await db.select({ version: max(estimates.version) }).from(estimates).where(eq(estimates.inquiryId, inquiryId));
  const estimateId = id("est");
  await db.insert(estimates).values({ id: estimateId, inquiryId, version: Number(latestVersion || 0) + 1, status: product.approvalRequired ? "draft" : "approved", lowCents: product.estimate.lowCents, highCents: product.estimate.highCents, assumptions: product.estimate.assumptions, createdByUserId: userId });
  if (product.estimate.lineItems.length) await db.insert(estimateLines).values(product.estimate.lineItems.map((item) => ({ id: id("line"), estimateId, lineType: item.lineType, description: item.description, quantity: item.quantity || 1, unit: item.unit || "each", unitCostCents: item.unitCostCents || 0, totalCents: Math.round(Number(item.quantity || 1) * Number(item.unitCostCents || 0)) })));
  return estimateId;
}

async function createProposalRecords(env, inquiryId, estimateId, documentId, product) {
  const db = getDb(env);
  const proposalId = id("prop");
  await db.insert(proposals).values({ id: proposalId, inquiryId, estimateId, documentId, status: product.approvalRequired ? "review" : "draft", priceLowCents: product.estimate.lowCents, priceHighCents: product.estimate.highCents, requiresApproval: product.approvalRequired });
  if (product.sections.length) await db.insert(proposalSections).values(product.sections.map((section, index) => ({ id: id("section"), proposalId, sectionKey: section.key, title: section.title, body: section.body, displayOrder: index + 1 })));
  return proposalId;
}

async function createSiteVisitRecords(env, inquiryId, userId, product) {
  const db = getDb(env);
  let [visit] = await db.select({ id: siteVisits.id }).from(siteVisits).where(and(eq(siteVisits.inquiryId, inquiryId), inArray(siteVisits.status, ["needed", "scheduled"]))).limit(1);
  const visitId = visit?.id || id("visit");
  if (!visit) await db.insert(siteVisits).values({ id: visitId, inquiryId, status: "needed", assignedUserId: userId, notes: "Generated from AI site checklist workflow." });
  const labels = product.body.split("\n").map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 12);
  await ensureChecklistItems(env, visitId, labels);
}

async function ensureChecklistItems(env, visitId, labels) {
  const db = getDb(env);
  const existing = await db.select({ itemKey: checklistItems.itemKey }).from(checklistItems).where(eq(checklistItems.siteVisitId, visitId));
  const keys = new Set(existing.map((item) => item.itemKey));
  const values = labels.map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 42) || id("item"), label })).filter((item) => !keys.has(item.key)).map((item) => ({ id: id("check"), siteVisitId: visitId, itemKey: item.key, label: item.label, status: "open" }));
  if (values.length) await db.insert(checklistItems).values(values).onConflictDoNothing();
}

async function queueCalendarHold(env, accountId, inquiryId, userId, payload) {
  const db = getDb(env);
  const integration = await createDefaultIntegration(env, accountId, userId, "calendar");
  const syncId = id("sync"), externalId = `calendar_hold_${payload.visitId}`;
  await db.insert(syncEvents).values({ id: syncId, integrationId: integration.id, inquiryId, status: "queued", operation: "calendar_hold", externalId });
  return { id: syncId, provider: "calendar", externalId, status: "queued" };
}

async function completeVisitIfReady(env, visitId) {
  const db = getDb(env);
  const [{ value }] = await db.select({ value: count(checklistItems.id) }).from(checklistItems).where(and(eq(checklistItems.siteVisitId, visitId), eq(checklistItems.status, "open")));
  if (Number(value || 0) === 0) await db.update(siteVisits).set({ status: "complete", updatedAt: now() }).where(and(eq(siteVisits.id, visitId), ne(siteVisits.status, "cancelled")));
}

async function createDeliveryAttempt(env, communicationId, payload) {
  const db = getDb(env);
  const [{ attempt: latestAttempt }] = await db.select({ attempt: max(communicationDeliveryAttempts.attemptNumber) }).from(communicationDeliveryAttempts).where(eq(communicationDeliveryAttempts.communicationId, communicationId));
  const deliveryId = id("delivery"), attemptNumber = Number(latestAttempt || 0) + 1;
  await db.insert(communicationDeliveryAttempts).values({ id: deliveryId, communicationId, provider: payload.provider, status: payload.status, attemptNumber, requestJson: JSON.stringify(payload.request || {}), responseJson: JSON.stringify(payload.response || {}), errorMessage: payload.errorMessage || null });
  return { id: deliveryId, communicationId, provider: payload.provider, status: payload.status, attemptNumber, errorMessage: payload.errorMessage || null };
}

async function createDefaultIntegration(env, accountId, userId, provider) { const created = await upsertIntegration(env, accountId, userId, provider); return { id: created.id }; }
function centsRange(low, high) { return low == null || high == null ? null : `$${Math.round(low / 100).toLocaleString()} - $${Math.round(high / 100).toLocaleString()}`; }
function normalizeDocumentType(type) { return ["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate", "closeout", "other"].includes(type) ? type : "other"; }
function titleForDocument(type) { return ({ follow_up_email: "Follow-up Email", proposal: "Proposal Draft", scope_of_work: "Scope of Work", site_checklist: "Site Visit Checklist", estimate: "Estimate", closeout: "Closeout", other: "Document" })[type] || "Document"; }
function runTypeForDocument(type) { return type === "scope_of_work" ? "scope" : ["follow_up_email", "proposal", "site_checklist", "estimate"].includes(type) ? type : "scope"; }
function integrationDisplayName(provider) { return ({ crm: "CRM", email: "Email", calendar: "Calendar", storage: "Storage" })[provider] || "Other"; }
function communicationChannel(channel) { const value = String(channel || "internal_note").toLowerCase(); return ["email", "phone", "text", "internal_note"].includes(value) ? value : "internal_note"; }
function channelLabel(channel) { return ({ email: "email", phone: "call note", text: "text message", internal_note: "internal note" })[channel] || "communication"; }
function communicationWebhook(env, channel) { return channel === "email" ? env.EMAIL_PROVIDER_WEBHOOK || env.COMMUNICATION_PROVIDER_WEBHOOK || "" : channel === "text" ? env.SMS_PROVIDER_WEBHOOK || env.COMMUNICATION_PROVIDER_WEBHOOK || "" : ""; }
function defaultSiteVisitStart() { const date = new Date(); date.setUTCDate(date.getUTCDate() + 2); date.setUTCHours(14, 0, 0, 0); return date.toISOString(); }
function addHours(value, hours) { const date = new Date(value); date.setUTCHours(date.getUTCHours() + hours); return date.toISOString(); }
function defaultChecklistLabels() { return ["Confirm site access window", "Capture room and equipment photos", "Validate rack and equipment inventory", "Confirm electrical disconnect and utility shutoff", "Document escort, security, and loading dock requirements"]; }
function normalizeEstimateLines(lines, lowCents) { const fallback = [{ lineType: "labor", description: "Labor", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .42) }, { lineType: "logistics", description: "Logistics", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .18) }, { lineType: "recycling", description: "Recycling", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .16) }, { lineType: "contingency", description: "Contingency", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .1) }]; return (Array.isArray(lines) && lines.length ? lines : fallback).slice(0, 24).map((line) => ({ lineType: estimateLineType(line.lineType), description: String(line.description || "Estimate line item").slice(0, 240), quantity: Number(line.quantity || 1), unit: String(line.unit || "each").slice(0, 40), unitCostCents: Math.round(Number(line.unitCostCents || 0)) })).filter((line) => Number.isFinite(line.quantity) && Number.isFinite(line.unitCostCents) && line.unitCostCents >= 0); }
function estimateLineType(type) { const value = String(type || "other").toLowerCase(); return ["labor", "logistics", "recycling", "equipment", "subcontractor", "contingency", "other"].includes(value) ? value : "other"; }
function safeJson(value) { if (!value) return null; try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; } }
function snake(row) { return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`), value])); }
function ageInDays(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86_400_000)) : 0; }
function dueLabel(value, selectedDate) { if (!value) return "Ready to work"; if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return "Due date needs confirmation"; const date = value.slice(0, 10); if (date < selectedDate) return "Overdue"; if (date === selectedDate) return "Due today"; return `Due ${date}`; }
function dateParts(value, timezone) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
function dateKey(value, timezone) { const parts = dateParts(value, timezone); return `${parts.year}-${parts.month}-${parts.day}`; }
function minutesInDay(value, timezone) { const parts = dateParts(value, timezone); return Number(parts.hour) * 60 + Number(parts.minute); }
function formatTime(value, timezone) { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function localScheduleIso(dateValue, hour, minute, timezone) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(desiredUtc);
  const observed = dateParts(guess, timezone);
  const observedUtc = Date.UTC(Number(observed.year), Number(observed.month) - 1, Number(observed.day), Number(observed.hour), Number(observed.minute));
  return new Date(desiredUtc - (observedUtc - desiredUtc)).toISOString();
}
function workflowEvent(action, title, startMinutes, duration) {
  return { id: `workflow:${action.id}`, kind: action.type, inquiryId: action.inquiryId, title, company: action.company, detail: action.detail, startMinutes, endMinutes: startMinutes + duration, screen: action.screen, status: "planned", source: "workflow" };
}
