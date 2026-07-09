import { and, asc, count, desc, eq, inArray, like, lt, max, ne, or } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  activityEvents, aiRuns, aiSummaries, auditLog, checklistItems, communicationDeliveryAttempts,
  communications, companies, contacts, documents, documentVersions, estimateLines, estimates, fileRetentionPolicies, fileShareLinks, inquiryComments,
  extractedFields, files, inquiries, inquirySources, inquiryWatchers, integrationConnections, missingRequirements,
  notifications, proposals, proposalSections, sites, siteVisits, syncEvents, userPreferences, userRecentItems, userSavedViews, users
} from "../../db/drizzle-schema.js";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const writeGroup = (db, callback) => callback(db);
const LOW_CONFIDENCE_THRESHOLD = 70;
const D1_SAFE_INSERT_CHUNK_SIZE = 8;
const NOTIFICATION_TYPES = new Set(["lead_created", "extraction_complete", "extraction_low_confidence", "missing_information", "follow_up_needed", "proposal_ready", "site_visit_needed", "status_changed", "system_success", "system_error"]);
const NOTIFICATION_SEVERITIES = new Set(["info", "success", "warning", "error"]);
const NOTIFICATION_STATUSES = new Set(["unread", "read", "archived"]);
const STATUS_TRANSITIONS = {
  new: ["needs_info", "estimating", "site_visit", "proposal", "lost", "archived"],
  needs_info: ["estimating", "site_visit", "proposal", "lost", "archived"],
  estimating: ["needs_info", "site_visit", "proposal", "lost", "archived"],
  site_visit: ["needs_info", "estimating", "proposal", "lost", "archived"],
  proposal: ["needs_info", "estimating", "review", "won", "lost", "archived"],
  review: ["proposal", "won", "lost", "archived"],
  won: ["archived"],
  lost: ["archived"],
  archived: []
};

async function insertValues(db, table, values, options = {}) {
  const chunkSize = options.chunkSize || D1_SAFE_INSERT_CHUNK_SIZE;
  for (let index = 0; index < values.length; index += chunkSize) {
    let statement = db.insert(table).values(values.slice(index, index + chunkSize));
    if (options.onConflictDoNothing) statement = statement.onConflictDoNothing();
    await statement;
  }
}

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
    last_customer_activity_at: inquiries.lastCustomerActivityAt, received_at: inquiries.receivedAt, owner_user_id: inquiries.ownerUserId,
    owner_name: users.fullName, owner_email: users.email, owner_avatar_url: users.avatarUrl, company_name: companies.name,
    contact_name: contacts.fullName, contact_email: contacts.email, contact_phone: contacts.phone,
    city: sites.city, region: sites.region, missing_count: count(missingRequirements.id)
  }).from(inquiries)
    .leftJoin(companies, eq(companies.id, inquiries.companyId))
    .leftJoin(contacts, eq(contacts.id, inquiries.contactId))
    .leftJoin(sites, eq(sites.id, inquiries.siteId))
    .leftJoin(users, eq(users.id, inquiries.ownerUserId))
    .leftJoin(missingRequirements, and(eq(missingRequirements.inquiryId, inquiries.id), inArray(missingRequirements.status, ["open", "requested"])))
    .where(and(...predicates)).groupBy(inquiries.id).orderBy(desc(inquiries.receivedAt));
  const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = rows.sort((a, b) => (priority[a.priority] ?? 4) - (priority[b.priority] ?? 4));
  if (filters.limit == null && filters.offset == null) return sorted;
  const offset = Number(filters.offset || 0);
  const limit = Number(filters.limit || 30);
  return { inquiries: sorted.slice(offset, offset + limit), total: sorted.length, limit, offset, hasMore: offset + limit < sorted.length };
}

export async function getInquiryDetail(env, accountId, inquiryId, viewerUserId = null) {
  const db = getDb(env);
  const [row] = await db.select({ inquiry: inquiries, company_name: companies.name, website: companies.website, contact_name: contacts.fullName, contact_email: contacts.email, contact_phone: contacts.phone, site_name: sites.name, address_line1: sites.addressLine1, address_line2: sites.addressLine2, city: sites.city, region: sites.region, postal_code: sites.postalCode, country: sites.country, access_notes: sites.accessNotes, owner_name: users.fullName, owner_email: users.email, owner_avatar_url: users.avatarUrl })
    .from(inquiries).leftJoin(companies, eq(companies.id, inquiries.companyId)).leftJoin(contacts, eq(contacts.id, inquiries.contactId)).leftJoin(sites, eq(sites.id, inquiries.siteId))
    .leftJoin(users, eq(users.id, inquiries.ownerUserId))
    .where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!row) return null;
  const inquiry = { ...snake(row.inquiry), company_name: row.company_name, website: row.website, contact_name: row.contact_name, contact_email: row.contact_email, contact_phone: row.contact_phone, site_name: row.site_name, address_line1: row.address_line1, address_line2: row.address_line2, city: row.city, region: row.region, postal_code: row.postal_code, country: row.country, access_notes: row.access_notes, owner_name: row.owner_name, owner_email: row.owner_email, owner_avatar_url: row.owner_avatar_url };
  const [fieldRows, missingRows, summaryRows, activityRows, documentRows, fileRows, communicationRows, commentRows, visitRows, watcherState] = await Promise.all([
    db.select().from(extractedFields).where(eq(extractedFields.inquiryId, inquiryId)).orderBy(asc(extractedFields.fieldKey)),
    db.select().from(missingRequirements).where(eq(missingRequirements.inquiryId, inquiryId)).orderBy(desc(missingRequirements.severity), asc(missingRequirements.category), asc(missingRequirements.label)),
    db.select().from(aiSummaries).where(eq(aiSummaries.inquiryId, inquiryId)).orderBy(desc(aiSummaries.generatedAt)),
    db.select().from(activityEvents).where(eq(activityEvents.inquiryId, inquiryId)).orderBy(desc(activityEvents.createdAt)).limit(25),
    db.select({ document: documents, version_id: documentVersions.id, subject: documentVersions.subject, body: documentVersions.body, metadata_json: documentVersions.metadataJson, generated_by_ai: documentVersions.generatedByAi, version_created_at: documentVersions.createdAt }).from(documents).leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion))).where(eq(documents.inquiryId, inquiryId)).orderBy(desc(documents.updatedAt)),
    db.select().from(files).where(eq(files.inquiryId, inquiryId)).orderBy(desc(files.uploadedAt)),
    listCommunications(env, accountId, inquiryId),
    listInquiryComments(env, accountId, inquiryId),
    listSiteVisits(env, accountId, inquiryId),
    listInquiryWatchers(env, accountId, inquiryId, viewerUserId)
  ]);
  const documentIds = documentRows.map((entry) => entry.document.id);
  const versionRows = documentIds.length ? await db.select().from(documentVersions).where(inArray(documentVersions.documentId, documentIds)).orderBy(asc(documentVersions.documentId), desc(documentVersions.version)) : [];
  const versionsByDocument = new Map();
  for (const version of versionRows) {
    const normalized = { ...snake(version), metadata: safeJson(version.metadataJson) || {} };
    if (!versionsByDocument.has(version.documentId)) versionsByDocument.set(version.documentId, []);
    versionsByDocument.get(version.documentId).push(normalized);
  }

  return {
    inquiry,
    fields: fieldRows.map(snake), missing: missingRows.map(snake), summaries: summaryRows.map(snake), activity: activityRows.map(snake),
    documents: documentRows.map((entry) => ({ ...snake(entry.document), version_id: entry.version_id, subject: entry.subject, body: entry.body, metadata_json: entry.metadata_json, generated_by_ai: entry.generated_by_ai ? 1 : 0, version_created_at: entry.version_created_at, version_history: versionsByDocument.get(entry.document.id) || [] })),
    files: fileRows.map(snake), communications: communicationRows, comments: commentRows, siteVisits: visitRows,
    watchers: watcherState.watchers, watcher_count: watcherState.watcherCount, is_watching: watcherState.isWatching
  };
}

export async function deleteInquiry(env, accountId, inquiryId) {
  const db = getDb(env);
  const [inquiry] = await db.select().from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;

  const [fileRows, missingRows, documentRows, proposalRows, estimateRows, communicationRows, commentRows, visitRows] = await Promise.all([
    db.select({ id: files.id, storageKey: files.storageKey, thumbnailStorageKey: files.thumbnailStorageKey }).from(files).where(eq(files.inquiryId, inquiryId)),
    db.select({ id: missingRequirements.id }).from(missingRequirements).where(eq(missingRequirements.inquiryId, inquiryId)),
    db.select({ id: documents.id }).from(documents).where(eq(documents.inquiryId, inquiryId)),
    db.select({ id: proposals.id }).from(proposals).where(eq(proposals.inquiryId, inquiryId)),
    db.select({ id: estimates.id }).from(estimates).where(eq(estimates.inquiryId, inquiryId)),
    db.select({ id: communications.id }).from(communications).where(eq(communications.inquiryId, inquiryId)),
    db.select({ id: inquiryComments.id }).from(inquiryComments).where(eq(inquiryComments.inquiryId, inquiryId)),
    db.select({ id: siteVisits.id }).from(siteVisits).where(eq(siteVisits.inquiryId, inquiryId))
  ]);
  const fileIds = fileRows.map((row) => row.id);
  const shareRows = fileIds.length ? await db.select({ id: fileShareLinks.id }).from(fileShareLinks).where(inArray(fileShareLinks.fileId, fileIds)) : [];
  const visitIds = visitRows.map((row) => row.id);
  const checklistRows = visitIds.length ? await db.select({ id: checklistItems.id }).from(checklistItems).where(inArray(checklistItems.siteVisitId, visitIds)) : [];
  const auditedEntityIds = [inquiryId, ...missingRows, ...documentRows, ...proposalRows, ...estimateRows, ...communicationRows, ...commentRows, ...shareRows, ...visitRows, ...checklistRows].map((row) => typeof row === "string" ? row : row.id);

  if (fileRows.length) {
    if (!env?.FILES?.delete) throw new Error("File storage deletion is not available.");
    await Promise.all(fileRows.flatMap((file) => [file.storageKey, file.thumbnailStorageKey].filter(Boolean).map((key) => env.FILES.delete(key))));
  }

  await writeGroup(db, async (tx) => {
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

export async function createActivity(env, accountId, inquiryId, actorUserId, eventType, summary, metadata = {}, db = getDb(env)) {
  const eventId = id("evt");
  await db.insert(activityEvents).values({ id: eventId, accountId, inquiryId, actorUserId, eventType, summary, metadataJson: JSON.stringify(metadata) });
  return { id: eventId };
}

export async function createAuditLog(env, accountId, actorUserId, entityType, entityId, action, before = null, after = null, db = getDb(env)) {
  const auditId = id("audit");
  await db.insert(auditLog).values({ id: auditId, accountId, actorUserId, entityType, entityId, action, beforeJson: before ? JSON.stringify(before) : null, afterJson: after ? JSON.stringify(after) : null });
  return { id: auditId };
}

export async function createNotification(env, accountId, userId, payload, db = getDb(env)) {
  const type = normalizeNotificationType(payload.type);
  const severity = normalizeNotificationSeverity(payload.severity);
  const notificationId = id("notif");
  const dedupeKey = String(payload.dedupeKey || `${type}:${payload.inquiryId || "account"}:${payload.title || payload.message}`).slice(0, 240);
  const value = {
    id: notificationId,
    accountId,
    userId,
    inquiryId: payload.inquiryId || null,
    type,
    title: String(payload.title || notificationTitle(type)).slice(0, 180),
    message: String(payload.message || "").slice(0, 1000),
    severity,
    status: "unread",
    actionLabel: payload.actionLabel || null,
    actionRoute: payload.actionRoute || null,
    metadataJson: JSON.stringify(payload.metadata || {}),
    dedupeKey,
    createdAt: now()
  };
  await db.insert(notifications).values(value).onConflictDoNothing();
  const [row] = await db.select().from(notifications).where(and(eq(notifications.accountId, accountId), eq(notifications.userId, userId), eq(notifications.dedupeKey, dedupeKey))).limit(1);
  return row ? publicNotification(row) : publicNotification(value);
}

export async function listNotifications(env, accountId, userId, filters = {}) {
  const db = getDb(env);
  const predicates = [eq(notifications.accountId, accountId), eq(notifications.userId, userId)];
  if (!filters.includeArchived) predicates.push(ne(notifications.status, "archived"));
  const rows = await db.select().from(notifications).where(and(...predicates)).orderBy(desc(notifications.createdAt)).limit(Math.min(Number(filters.limit || 25), 100));
  const unread = await db.select({ value: count(notifications.id) }).from(notifications).where(and(eq(notifications.accountId, accountId), eq(notifications.userId, userId), eq(notifications.status, "unread")));
  return { notifications: rows.map(publicNotification), unreadCount: Number(unread[0]?.value || 0) };
}

export async function markNotificationRead(env, accountId, userId, notificationId, status = "read") {
  const normalized = normalizeNotificationStatus(status);
  const updates = { status: normalized, readAt: normalized === "read" ? now() : null, archivedAt: normalized === "archived" ? now() : null };
  await getDb(env).update(notifications).set(updates).where(and(eq(notifications.accountId, accountId), eq(notifications.userId, userId), eq(notifications.id, notificationId)));
  const [row] = await getDb(env).select().from(notifications).where(and(eq(notifications.accountId, accountId), eq(notifications.userId, userId), eq(notifications.id, notificationId))).limit(1);
  return row ? publicNotification(row) : null;
}

export async function markAllNotificationsRead(env, accountId, userId) {
  await getDb(env).update(notifications).set({ status: "read", readAt: now() }).where(and(eq(notifications.accountId, accountId), eq(notifications.userId, userId), eq(notifications.status, "unread")));
  return listNotifications(env, accountId, userId);
}

export async function dismissNotification(env, accountId, userId, notificationId) {
  return markNotificationRead(env, accountId, userId, notificationId, "archived");
}

export async function generateLeadNotifications(env, accountId, userId, context, db = getDb(env)) {
  const inquiry = context.inquiry || {};
  if (!inquiry.id) return [];
  const created = [];
  created.push(await createNotification(env, accountId, userId, {
    type: "lead_created",
    title: "New lead received",
    message: `${inquiry.title || "A new inquiry"} is ready for review.`,
    severity: "info",
    inquiryId: inquiry.id,
    actionLabel: "Review lead",
    actionRoute: "detail",
    dedupeKey: `lead_created:${inquiry.id}`,
    metadata: { sourceChannel: inquiry.sourceChannel || inquiry.source_channel || null }
  }, db));
  if (context.analysis) created.push(...await generateExtractionNotifications(env, accountId, userId, context, db));
  return created;
}

export async function generateExtractionNotifications(env, accountId, userId, context, db = getDb(env)) {
  const inquiry = context.inquiry || {};
  const extraction = context.analysis?.extraction || context.extraction || {};
  if (!inquiry.id) return [];
  const confidence = Number(extraction.confidenceScore ?? extraction.confidence_score ?? inquiry.confidenceScore ?? inquiry.confidence_score ?? 0);
  const missing = Array.isArray(extraction.missingRequirements) ? extraction.missingRequirements : context.missingRequirements || [];
  const created = [];
  created.push(await createNotification(env, accountId, userId, {
    type: "extraction_complete",
    title: "AI extraction complete",
    message: `${inquiry.title} was structured with ${Number.isFinite(confidence) ? `${confidence}%` : "available"} confidence.`,
    severity: "success",
    inquiryId: inquiry.id,
    actionLabel: "Review extraction",
    actionRoute: "detail",
    dedupeKey: `extraction_complete:${inquiry.id}`,
    metadata: { confidenceScore: confidence, mode: context.analysis?.mode || null }
  }, db));
  if (confidence > 0 && confidence < LOW_CONFIDENCE_THRESHOLD) {
    created.push(await createNotification(env, accountId, userId, {
      type: "extraction_low_confidence",
      title: "Low-confidence extraction",
      message: `${inquiry.title} needs human review before quoting.`,
      severity: "warning",
      inquiryId: inquiry.id,
      actionLabel: "Review lead",
      actionRoute: "detail",
      dedupeKey: `extraction_low_confidence:${inquiry.id}`,
      metadata: { confidenceScore: confidence, threshold: LOW_CONFIDENCE_THRESHOLD }
    }, db));
  }
  if (missing.length) {
    const blockingCount = missing.filter((item) => ["high", "blocking"].includes(item.severity)).length;
    created.push(await createNotification(env, accountId, userId, {
      type: "missing_information",
      title: "Missing project information",
      message: `${missing.length} ${missing.length === 1 ? "detail is" : "details are"} missing${blockingCount ? `, including ${blockingCount} critical ${blockingCount === 1 ? "item" : "items"}` : ""}.`,
      severity: blockingCount ? "warning" : "info",
      inquiryId: inquiry.id,
      actionLabel: "Complete missing info",
      actionRoute: "detail",
      dedupeKey: `missing_information:${inquiry.id}`,
      metadata: { missingCount: missing.length, blockingCount }
    }, db));
    created.push(await createNotification(env, accountId, userId, {
      type: "follow_up_needed",
      title: "Follow-up needed",
      message: `Send a follow-up to collect missing details for ${inquiry.title}.`,
      severity: "warning",
      inquiryId: inquiry.id,
      actionLabel: "Draft follow-up",
      actionRoute: "email",
      dedupeKey: `follow_up_needed:${inquiry.id}`,
      metadata: { missingCount: missing.length }
    }, db));
  } else {
    created.push(await createNotification(env, accountId, userId, {
      type: "proposal_ready",
      title: "Lead ready for proposal work",
      message: `${inquiry.title} has enough information to start a scope, estimate, or proposal.`,
      severity: "success",
      inquiryId: inquiry.id,
      actionLabel: "Generate document",
      actionRoute: "proposal",
      dedupeKey: `proposal_ready_from_extraction:${inquiry.id}`,
      metadata: { confidenceScore: confidence }
    }, db));
  }
  return created;
}

export async function getUserPreferences(env, userId) {
  const [row] = await getDb(env).select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return row ? snake(row) : null;
}

export async function getUserWorkspaceState(env, userId) {
  const db = getDb(env);
  const [savedViews, recentItems] = await Promise.all([
    db.select().from(userSavedViews).where(eq(userSavedViews.userId, userId)).orderBy(asc(userSavedViews.screen), desc(userSavedViews.isDefault), asc(userSavedViews.name)),
    db.select().from(userRecentItems).where(eq(userRecentItems.userId, userId)).orderBy(desc(userRecentItems.lastViewedAt)).limit(12)
  ]);
  return {
    savedViews: savedViews.map((row) => ({ ...snake(row), filters: safeJson(row.filtersJson), sort: safeJson(row.sortJson) })),
    recentItems: recentItems.map((row) => ({ ...snake(row), metadata: safeJson(row.metadataJson) }))
  };
}

export async function recordRecentItem(env, userId, entityType, entityId, metadata = {}) {
  const db = getDb(env);
  const timestamp = now();
  const value = {
    userId,
    entityType,
    entityId,
    lastViewedAt: timestamp,
    metadataJson: JSON.stringify(metadata || {})
  };
  await db.insert(userRecentItems).values(value).onConflictDoUpdate({
    target: [userRecentItems.userId, userRecentItems.entityType, userRecentItems.entityId],
    set: { lastViewedAt: timestamp, metadataJson: value.metadataJson }
  });
  return { ...snake(value), metadata: metadata || {} };
}

export async function listInquiryWatchers(env, accountId, inquiryId, viewerUserId = null, db = getDb(env)) {
  const rows = await db.select({
    watcher: inquiryWatchers,
    fullName: users.fullName,
    email: users.email,
    avatarUrl: users.avatarUrl
  })
    .from(inquiryWatchers)
    .innerJoin(inquiries, eq(inquiries.id, inquiryWatchers.inquiryId))
    .innerJoin(users, eq(users.id, inquiryWatchers.userId))
    .where(and(eq(inquiries.accountId, accountId), eq(inquiryWatchers.inquiryId, inquiryId), eq(users.accountId, accountId)))
    .orderBy(asc(inquiryWatchers.createdAt));
  const watchers = rows.map(({ watcher, fullName, email, avatarUrl }) => ({
    ...snake(watcher),
    full_name: fullName,
    email,
    avatar_url: avatarUrl
  }));
  return {
    watchers,
    watcherCount: watchers.length,
    isWatching: Boolean(viewerUserId && watchers.some((watcher) => watcher.user_id === viewerUserId))
  };
}

export async function watchInquiry(env, accountId, inquiryId, userId) {
  const db = getDb(env);
  const result = await writeGroup(db, async (tx) => {
    const [entry] = await tx.select({ id: inquiries.id, title: inquiries.title }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
    if (!entry) return null;
    const watcherId = id("watch");
    await tx.insert(inquiryWatchers).values({ id: watcherId, inquiryId, userId }).onConflictDoNothing();
    await createActivity(env, accountId, inquiryId, userId, "inquiry.watch_started", "Started watching inquiry updates", { watcherId }, tx);
    await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "watch.started", null, { inquiryId, userId }, tx);
    return entry;
  });
  if (!result) return null;
  return listInquiryWatchers(env, accountId, inquiryId, userId);
}

export async function unwatchInquiry(env, accountId, inquiryId, userId) {
  const db = getDb(env);
  const result = await writeGroup(db, async (tx) => {
    const [entry] = await tx.select({ id: inquiries.id, title: inquiries.title, watcherId: inquiryWatchers.id })
      .from(inquiries)
      .leftJoin(inquiryWatchers, and(eq(inquiryWatchers.inquiryId, inquiries.id), eq(inquiryWatchers.userId, userId)))
      .where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
    if (!entry) return null;
    if (entry.watcherId) await tx.delete(inquiryWatchers).where(eq(inquiryWatchers.id, entry.watcherId));
    await createActivity(env, accountId, inquiryId, userId, "inquiry.watch_stopped", "Stopped watching inquiry updates", { watcherId: entry.watcherId || null }, tx);
    await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "watch.stopped", { inquiryId, userId }, null, tx);
    return entry;
  });
  if (!result) return null;
  return listInquiryWatchers(env, accountId, inquiryId, userId);
}

export async function notifyInquiryWatchers(env, accountId, inquiryId, actorUserId, payload, db = getDb(env)) {
  const state = await listInquiryWatchers(env, accountId, inquiryId, actorUserId, db);
  const recipients = state.watchers.filter((watcher) => watcher.user_id !== actorUserId);
  const created = [];
  for (const watcher of recipients) {
    created.push(await createNotification(env, accountId, watcher.user_id, {
      ...payload,
      inquiryId,
      dedupeKey: `${payload.dedupeKey || payload.type || "watch"}:${watcher.user_id}`
    }, db));
  }
  return created;
}

export async function upsertSavedView(env, accountId, userId, payload) {
  const db = getDb(env);
  const existing = await db.select().from(userSavedViews).where(and(eq(userSavedViews.userId, userId), eq(userSavedViews.screen, payload.screen), eq(userSavedViews.name, payload.name))).limit(1);
  const before = existing[0] ? publicSavedView(existing[0]) : null;
  const viewId = before?.id || id("view");
  const value = {
    id: viewId,
    userId,
    screen: payload.screen,
    name: payload.name,
    filtersJson: JSON.stringify(payload.filters || {}),
    sortJson: JSON.stringify(payload.sort || {}),
    isDefault: Boolean(payload.isDefault),
    updatedAt: now()
  };
  await writeGroup(db, async (tx) => {
    if (value.isDefault) await tx.update(userSavedViews).set({ isDefault: false, updatedAt: now() }).where(and(eq(userSavedViews.userId, userId), eq(userSavedViews.screen, payload.screen)));
    await tx.insert(userSavedViews).values(value).onConflictDoUpdate({
      target: [userSavedViews.userId, userSavedViews.screen, userSavedViews.name],
      set: {
        filtersJson: value.filtersJson,
        sortJson: value.sortJson,
        isDefault: value.isDefault,
        updatedAt: value.updatedAt
      }
    });
  });
  const [afterRow] = await db.select().from(userSavedViews).where(and(eq(userSavedViews.userId, userId), eq(userSavedViews.screen, payload.screen), eq(userSavedViews.name, payload.name))).limit(1);
  const after = publicSavedView(afterRow);
  await createAuditLog(env, accountId, userId, "saved_view", after.id, before ? "saved_view.updated" : "saved_view.created", before, after);
  return after;
}

export async function deleteSavedView(env, accountId, userId, viewId) {
  const db = getDb(env);
  const [beforeRow] = await db.select().from(userSavedViews).where(and(eq(userSavedViews.userId, userId), eq(userSavedViews.id, viewId))).limit(1);
  if (!beforeRow) return null;
  const before = publicSavedView(beforeRow);
  await db.delete(userSavedViews).where(and(eq(userSavedViews.userId, userId), eq(userSavedViews.id, viewId)));
  await createAuditLog(env, accountId, userId, "saved_view", viewId, "saved_view.deleted", before, null);
  return before;
}

export async function listAuditEvents(env, accountId, filters = {}) {
  const predicates = [eq(auditLog.accountId, accountId)];
  if (filters.entityType) predicates.push(eq(auditLog.entityType, filters.entityType));
  const rows = await getDb(env).select().from(auditLog).where(and(...predicates)).orderBy(desc(auditLog.createdAt)).limit(Math.min(Number(filters.limit || 50), 100));
  return rows.map((row) => ({ ...snake(row), before: safeJson(row.beforeJson), after: safeJson(row.afterJson) }));
}

export async function listProviderQueue(env, accountId, filters = {}) {
  const limit = Math.min(Number(filters.limit || 50), 100);
  const db = getDb(env);
  const syncPredicates = [eq(integrationConnections.accountId, accountId)];
  const deliveryPredicates = [eq(inquiries.accountId, accountId)];
  if (filters.status) {
    syncPredicates.push(eq(syncEvents.status, filters.status));
    deliveryPredicates.push(eq(communicationDeliveryAttempts.status, filters.status));
  }
  const [syncRows, deliveryRows] = await Promise.all([
    db.select({
      id: syncEvents.id,
      provider: integrationConnections.provider,
      displayName: integrationConnections.displayName,
      status: syncEvents.status,
      operation: syncEvents.operation,
      externalId: syncEvents.externalId,
      errorMessage: syncEvents.errorMessage,
      createdAt: syncEvents.createdAt,
      inquiryId: syncEvents.inquiryId,
      inquiryTitle: inquiries.title
    }).from(syncEvents)
      .innerJoin(integrationConnections, eq(integrationConnections.id, syncEvents.integrationId))
      .leftJoin(inquiries, eq(inquiries.id, syncEvents.inquiryId))
      .where(and(...syncPredicates)).orderBy(desc(syncEvents.createdAt)).limit(limit),
    db.select({
      id: communicationDeliveryAttempts.id,
      provider: communicationDeliveryAttempts.provider,
      status: communicationDeliveryAttempts.status,
      operation: communications.channel,
      attemptNumber: communicationDeliveryAttempts.attemptNumber,
      errorMessage: communicationDeliveryAttempts.errorMessage,
      createdAt: communicationDeliveryAttempts.createdAt,
      communicationId: communicationDeliveryAttempts.communicationId,
      inquiryId: inquiries.id,
      inquiryTitle: inquiries.title
    }).from(communicationDeliveryAttempts)
      .innerJoin(communications, eq(communications.id, communicationDeliveryAttempts.communicationId))
      .innerJoin(inquiries, eq(inquiries.id, communications.inquiryId))
      .where(and(...deliveryPredicates)).orderBy(desc(communicationDeliveryAttempts.createdAt)).limit(limit)
  ]);
  return [...syncRows.map((row) => ({ type: "sync", ...snake(row) })), ...deliveryRows.map((row) => ({ type: "delivery", ...snake(row) }))]
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
    .slice(0, limit);
}

export async function updateUserPreferences(env, accountId, userId, payload) {
  const before = await getUserPreferences(env, userId);
  const conflict = staleUpdate(payload, before, "preferences");
  if (conflict) return conflict;
  const settings = { highPriorityAlerts: Boolean(payload.highPriorityAlerts), leaseDeadlineReminders: Boolean(payload.leaseDeadlineReminders), dailyDigest: Boolean(payload.dailyDigest), theme: payload.theme || "system" };
  const priorSettings = safeJson(before?.settings_json) || {};
  await getDb(env).update(userPreferences).set({
    defaultView: payload.defaultView || before?.default_view || "today",
    timezone: payload.timezone || before?.timezone || "America/New_York",
    notificationDigest: settings.dailyDigest ? "daily" : "none",
    settingsJson: JSON.stringify({ ...priorSettings, ...settings }),
    updatedAt: now()
  }).where(eq(userPreferences.userId, userId));
  const after = await getUserPreferences(env, userId);
  await createAuditLog(env, accountId, userId, "user_preferences", userId, "preferences.updated", before, after);
  return after;
}

export async function updateUserProfile(env, accountId, userId, payload) {
  const db = getDb(env);
  const [before] = await db.select().from(users).where(and(eq(users.accountId, accountId), eq(users.id, userId))).limit(1);
  if (!before) return null;
  const conflict = staleUpdate(payload, before, "profile");
  if (conflict) return conflict;
  await db.update(users).set({ fullName: String(payload.fullName || before.fullName).trim() || before.fullName, avatarUrl: payload.avatarUrl === undefined ? before.avatarUrl : payload.avatarUrl || null, updatedAt: now() }).where(eq(users.id, userId));
  const [after] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await createAuditLog(env, accountId, userId, "user", userId, "profile.updated", snake(before), snake(after));
  return snake(after);
}

export async function listIntegrations(env, accountId) {
  return (await getDb(env).select().from(integrationConnections).where(eq(integrationConnections.accountId, accountId)).orderBy(asc(integrationConnections.provider), asc(integrationConnections.displayName))).map((row) => {
    const item = snake(row);
    delete item.metadata_json;
    return item;
  });
}

export async function upsertIntegration(env, accountId, userId, provider) {
  if (provider === "calendar") throw new Error("Use the Google Calendar connection flow to connect a calendar.");
  const db = getDb(env);
  const displayName = integrationDisplayName(provider);
  const [existing] = await db.select().from(integrationConnections).where(and(eq(integrationConnections.accountId, accountId), eq(integrationConnections.provider, provider), eq(integrationConnections.displayName, displayName))).limit(1);
  const metadataJson = JSON.stringify({ connectedBy: userId, mode: "manual", note: "Connection record is active. Configure provider credentials for live delivery." });
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
  const [entry] = await db.select({ inquiry: inquiries, company_name: companies.name, contact_name: contacts.fullName, contact_email: contacts.email, contact_phone: contacts.phone, city: sites.city, region: sites.region })
    .from(inquiries)
    .leftJoin(companies, eq(companies.id, inquiries.companyId))
    .leftJoin(contacts, eq(contacts.id, inquiries.contactId))
    .leftJoin(sites, eq(sites.id, inquiries.siteId))
    .where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  const inquiry = entry?.inquiry;
  if (!inquiry) return null;
  const syncId = id("sync");
  const externalId = `${provider}_${inquiryId}`;
  const operation = "upsert_opportunity";
  const request = {
    externalId,
    inquiryId,
    title: inquiry.title,
    status: inquiry.status,
    serviceType: inquiry.serviceType,
    priority: inquiry.priority,
    estimate: { lowCents: inquiry.estimatedLowCents, highCents: inquiry.estimatedHighCents },
    company: entry.company_name,
    contact: { name: entry.contact_name, email: entry.contact_email, phone: entry.contact_phone },
    site: { city: entry.city, region: entry.region }
  };
  const webhook = integrationWebhook(env, provider);
  if (!webhook) {
    await db.insert(syncEvents).values({ id: syncId, integrationId: integration.id, inquiryId, status: "queued", operation, externalId, errorMessage: `${provider.toUpperCase()} provider webhook is not configured.` });
    await createActivity(env, accountId, inquiryId, userId, "integration.queued", `Queued ${inquiry.title} for ${provider.toUpperCase()} sync`, { syncId, provider, externalId });
    return { id: syncId, provider, externalId, status: "queued", operation, nextRetryAfterSeconds: 300 };
  }
  try {
    const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    const responseText = await response.text();
    const responseBody = safeJson(responseText) || { body: responseText.slice(0, 1200) };
    const status = response.ok ? "success" : "failed";
    await db.insert(syncEvents).values({ id: syncId, integrationId: integration.id, inquiryId, status, operation, externalId: responseBody.id || responseBody.externalId || externalId, errorMessage: response.ok ? null : `Provider returned ${response.status}` });
    await createActivity(env, accountId, inquiryId, userId, response.ok ? "integration.synced" : "integration.failed", `${response.ok ? "Synced" : "Could not sync"} ${inquiry.title} to ${provider.toUpperCase()}`, { syncId, provider, externalId, response: responseBody });
    if (response.ok) await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "integration.synced", null, { provider, externalId });
    return { id: syncId, provider, externalId, status, operation, response: responseBody };
  } catch (error) {
    await db.insert(syncEvents).values({ id: syncId, integrationId: integration.id, inquiryId, status: "failed", operation, externalId, errorMessage: error.message });
    await createActivity(env, accountId, inquiryId, userId, "integration.failed", `Could not sync ${inquiry.title} to ${provider.toUpperCase()}`, { syncId, provider, externalId, error: error.message });
    return { id: syncId, provider, externalId, status: "failed", operation, error: error.message, nextRetryAfterSeconds: 300 };
  }
}

export async function updateInquiryStatus(env, accountId, inquiryId, userId, status, options = {}) {
  const db = getDb(env);
  const [before] = await db.select({ id: inquiries.id, status: inquiries.status, title: inquiries.title, updatedAt: inquiries.updatedAt }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!before) return null;
  const conflict = staleUpdate(options, before, "inquiry");
  if (conflict) return conflict;
  const allowed = STATUS_TRANSITIONS[before.status] || [];
  if (status !== before.status && !allowed.includes(status)) return { error: `Cannot move inquiry from ${before.status} to ${status}.`, allowed, statusCode: 409 };
  await db.update(inquiries).set({ status, updatedAt: now() }).where(eq(inquiries.id, inquiryId));
  const after = { ...before, status };
  await createActivity(env, accountId, inquiryId, userId, "inquiry.status_updated", `Moved ${before.title} to ${status}`, { from: before.status, to: status });
  if (status !== before.status) await createNotification(env, accountId, userId, {
    type: "status_changed",
    title: "Lead status changed",
    message: `${before.title} moved from ${stageLabel(before.status)} to ${stageLabel(status)}.`,
    severity: ["lost", "archived"].includes(status) ? "warning" : "info",
    inquiryId,
    actionLabel: "Review lead",
    actionRoute: "detail",
    dedupeKey: `status_changed:${inquiryId}:${before.status}:${status}`,
    metadata: { from: before.status, to: status }
  });
  if (status !== before.status) await notifyInquiryWatchers(env, accountId, inquiryId, userId, {
    type: "status_changed",
    title: "Watched inquiry changed",
    message: `${before.title} moved from ${stageLabel(before.status)} to ${stageLabel(status)}.`,
    severity: ["lost", "archived"].includes(status) ? "warning" : "info",
    actionLabel: "Open inquiry",
    actionRoute: "detail",
    dedupeKey: `status_changed_watch:${inquiryId}:${before.status}:${status}`,
    metadata: { from: before.status, to: status, actorUserId: userId }
  });
  await createAuditLog(env, accountId, userId, "inquiry", inquiryId, "status.updated", before, after);
  return after;
}

export async function updateInquiryOwner(env, accountId, inquiryId, actorUserId, ownerUserId, options = {}) {
  const db = getDb(env);
  const [before] = await db.select({ id: inquiries.id, title: inquiries.title, ownerUserId: inquiries.ownerUserId, updatedAt: inquiries.updatedAt, ownerName: users.fullName, ownerEmail: users.email })
    .from(inquiries)
    .leftJoin(users, eq(users.id, inquiries.ownerUserId))
    .where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId)))
    .limit(1);
  if (!before) return null;
  const conflict = staleUpdate(options, before, "inquiry");
  if (conflict) return conflict;
  let owner = null;
  if (ownerUserId) {
    [owner] = await db.select({ id: users.id, fullName: users.fullName, email: users.email, avatarUrl: users.avatarUrl, isActive: users.isActive }).from(users).where(and(eq(users.accountId, accountId), eq(users.id, ownerUserId))).limit(1);
    if (!owner || !owner.isActive) return { error: "Owner must be an active user in this account.", statusCode: 400 };
  }
  await db.update(inquiries).set({ ownerUserId: owner?.id || null, updatedAt: now() }).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId)));
  const after = { id: inquiryId, title: before.title, owner_user_id: owner?.id || null, owner_name: owner?.fullName || null, owner_email: owner?.email || null, owner_avatar_url: owner?.avatarUrl || null };
  await createActivity(env, accountId, inquiryId, actorUserId, "inquiry.owner_updated", owner ? `Assigned ${before.title} to ${owner.fullName}` : `Removed owner from ${before.title}`, { from: before.ownerUserId || null, to: owner?.id || null });
  await createAuditLog(env, accountId, actorUserId, "inquiry", inquiryId, "owner.updated", { id: before.id, title: before.title, owner_user_id: before.ownerUserId, owner_name: before.ownerName, owner_email: before.ownerEmail }, after);
  if (owner?.id && owner.id !== actorUserId) await createNotification(env, accountId, owner.id, {
    type: "system_success",
    title: "Inquiry assigned to you",
    message: `${before.title} is now in your queue.`,
    severity: "info",
    inquiryId,
    actionLabel: "Open inquiry",
    actionRoute: "detail",
    dedupeKey: `inquiry_assigned:${inquiryId}:${owner.id}:${Date.now()}`,
    metadata: { assignedBy: actorUserId }
  });
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
  const conflict = staleUpdate(payload, before.inquiry, "inquiry");
  if (conflict) return conflict;
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
  const inquiryValue = { id: inquiryId, accountId, companyId, contactId, siteId, ownerUserId: userId, title: payload.title || `${company} Inquiry`, serviceType: payload.serviceType || "other", sourceChannel: payload.sourceChannel || "manual", priority: payload.priority || "medium", workload: payload.workload || "medium", status: "new", confidenceScore: payload.confidenceScore || 0, leaseEndDate: payload.leaseEndDate || null, receivedAt: now(), lastCustomerActivityAt: now(), createdAt: now(), updatedAt: now() };
  await db.insert(inquiries).values(inquiryValue);
  await db.insert(inquiryWatchers).values({ id: id("watch"), inquiryId, userId }).onConflictDoNothing();
  await db.insert(inquirySources).values({ id: sourceId, inquiryId, channel: payload.sourceChannel || "manual", subject: payload.subject || null, sender: payload.sender || null, rawText: payload.rawText || "", capturedByUserId: userId, capturedAt: now() });
  await db.insert(communications).values({ id: id("comm"), inquiryId, contactId, direction: "inbound", channel: communicationChannel(payload.sourceChannel), subject: payload.subject || null, body: payload.rawText || "", status: "received", externalMessageId: payload.externalMessageId || null, createdByUserId: userId, occurredAt: now() });
  await createActivity(env, accountId, inquiryId, userId, "inquiry.created", `Created inquiry ${payload.title || company}`, { sourceId }, db);
  await generateLeadNotifications(env, accountId, userId, { inquiry: inquiryValue }, db);
  return { id: inquiryId, companyId, contactId, siteId, sourceId };
}

export async function createInquiryFromExtraction(env, accountId, userId, payload, analysis) {
  const db = getDb(env);
  const extraction = analysis.extraction;
  const companyId = await findOrCreateCompany(env, accountId, extraction.company, db);
  const contactId = id("ct"), siteId = id("site"), inquiryId = id("inq"), sourceId = id("src"), summaryId = id("sum");
  const titleLocation = [extraction.site.city, extraction.site.region].filter(Boolean).join(", ");
  const title = `${extraction.company.name}${titleLocation ? ` - ${titleLocation}` : ""}`;
  const status = extraction.missingRequirements.length ? "needs_info" : "estimating";
  await db.insert(contacts).values({ id: contactId, accountId, companyId, fullName: extraction.contact.fullName, email: extraction.contact.email, phone: extraction.contact.phone, preferredChannel: extraction.contact.preferredChannel });
  await db.insert(sites).values({ id: siteId, accountId, companyId, name: extraction.site.name, city: extraction.site.city, region: extraction.site.region, country: extraction.site.country, siteType: extraction.site.siteType, accessNotes: extraction.site.accessNotes });
  const inquiryValue = { id: inquiryId, accountId, companyId, contactId, siteId, ownerUserId: userId, title, serviceType: extraction.service.type, sourceChannel: payload.sourceChannel || "manual", priority: extraction.priority, workload: extraction.workload, status, estimatedLowCents: extraction.estimateRange.lowCents, estimatedHighCents: extraction.estimateRange.highCents, confidenceScore: extraction.confidenceScore, leaseEndDate: extraction.timeline.leaseEndDate, requestedDueDate: extraction.timeline.requestedDueDate, receivedAt: now(), lastCustomerActivityAt: now(), createdAt: now(), updatedAt: now() };
  await db.insert(inquiries).values(inquiryValue);
  await db.insert(inquiryWatchers).values({ id: id("watch"), inquiryId, userId }).onConflictDoNothing();
  await db.insert(inquirySources).values({ id: sourceId, inquiryId, channel: payload.sourceChannel || "manual", subject: payload.subject || "AI intake source", sender: payload.sender || extraction.contact.email || extraction.contact.phone || extraction.contact.fullName, rawText: payload.rawText, capturedByUserId: userId, capturedAt: now() });
  await db.insert(communications).values({ id: id("comm"), inquiryId, contactId, direction: "inbound", channel: communicationChannel(payload.sourceChannel), subject: payload.subject || "AI intake source", body: payload.rawText, status: "received", externalMessageId: payload.externalMessageId || null, createdByUserId: userId, occurredAt: now() });
  await db.insert(aiSummaries).values({ id: summaryId, inquiryId, summaryType: "intake", body: extraction.summary, modelName: analysis.model, confidenceScore: extraction.confidenceScore, generatedByUserId: userId, generatedAt: now() });
  await persistExtractedFields(env, inquiryId, sourceId, extraction, db);
  await persistMissingRequirements(env, inquiryId, extraction.missingRequirements, db);
  const aiRun = await recordAiRun(env, accountId, inquiryId, userId, { runType: "intake_extraction", provider: analysis.mode === "live" ? "openai" : "local", modelName: analysis.model, promptVersionId: analysis.promptVersionId, status: analysis.mode === "live" ? "success" : "fallback", inputPreview: payload.rawText, output: extraction, errorMessage: analysis.error || null, latencyMs: analysis.latencyMs || null }, db);
  await createActivity(env, accountId, inquiryId, userId, "ai.intake_extracted", `${analysis.mode === "live" ? "AI" : "Fallback AI"} created structured intake for ${title}`, { aiRunId: aiRun.id, missingCount: extraction.missingRequirements.length }, db);
  await generateLeadNotifications(env, accountId, userId, { inquiry: inquiryValue, analysis }, db);
  return { id: inquiryId, companyId, contactId, siteId, sourceId, aiRunId: aiRun.id, status, missingCount: extraction.missingRequirements.length };
}

export async function recordAiRun(env, accountId, inquiryId, userId, run, db = getDb(env)) {
  const runId = id("airun");
  await db.insert(aiRuns).values({ id: runId, accountId, inquiryId: inquiryId || null, runType: run.runType, provider: run.provider || "openai", modelName: run.modelName || null, status: run.status, inputPreview: String(run.inputPreview || "").slice(0, 1200), outputJson: JSON.stringify({ ...(run.output || {}), promptVersionId: run.promptVersionId || null }), errorMessage: run.errorMessage || null, latencyMs: run.latencyMs || null, createdByUserId: userId });
  return { id: runId };
}

export async function createGeneratedWorkProduct(env, accountId, inquiryId, userId, type, analysis) {
  const db = getDb(env);
  const saved = await writeGroup(db, async (tx) => {
    const product = analysis.product;
    const documentId = id("doc"), versionId = id("docver");
    const documentType = normalizeDocumentType(product.documentType || type);
    await tx.insert(documents).values({ id: documentId, inquiryId, documentType, title: product.title, status: product.approvalRequired ? "review" : "draft", currentVersion: 1, createdByUserId: userId, createdAt: now(), updatedAt: now() });
    await tx.insert(documentVersions).values({ id: versionId, documentId, version: 1, subject: product.subject, body: product.body, metadataJson: JSON.stringify({ confidenceScore: product.confidenceScore, approvalRequired: product.approvalRequired, missingRiskNotes: product.missingRiskNotes, nextActions: product.nextActions, estimate: product.estimate, generationContext: analysis.generationContext || null, mode: analysis.mode, model: analysis.model, promptVersionId: analysis.promptVersionId || null }), generatedByAi: true, createdByUserId: userId, createdAt: now() });
    let estimateId = null;
    if (["estimate", "proposal"].includes(documentType) && product.estimate.lowCents != null && product.estimate.highCents != null) estimateId = await createEstimateRecords(env, inquiryId, userId, product, tx);
    let proposalId = null;
    if (documentType === "proposal") proposalId = await createProposalRecords(env, inquiryId, estimateId, documentId, product, tx);
    if (documentType === "site_checklist") await createSiteVisitRecords(env, inquiryId, userId, product, tx);
    const aiRun = await recordAiRun(env, accountId, inquiryId, userId, { runType: runTypeForDocument(documentType), provider: analysis.mode === "live" ? "openai" : "local", modelName: analysis.model, promptVersionId: analysis.promptVersionId, status: analysis.mode === "live" ? "success" : "fallback", inputPreview: product.title, output: product, errorMessage: analysis.error || null, latencyMs: analysis.latencyMs || null }, tx);
    await tx.insert(aiSummaries).values({ id: id("sum"), inquiryId, summaryType: documentType === "proposal" ? "proposal" : documentType === "scope_of_work" ? "scope" : "email", body: `Generated ${product.title}. ${product.nextActions.join(" ")}`, modelName: analysis.model, confidenceScore: product.confidenceScore, generatedByUserId: userId });
    await createActivity(env, accountId, inquiryId, userId, `ai.${runTypeForDocument(documentType)}`, `Generated ${product.title}`, { aiRunId: aiRun.id, documentId, versionId, estimateId, proposalId }, tx);
    if (documentType === "proposal") await createNotification(env, accountId, userId, {
      type: "proposal_ready",
      title: "Proposal ready for review",
      message: `${product.title} was generated and saved.`,
      severity: product.approvalRequired ? "warning" : "success",
      inquiryId,
      actionLabel: "Review proposal",
      actionRoute: "proposal",
      dedupeKey: `proposal_ready:${documentId}`,
      metadata: { documentId, proposalId, confidenceScore: product.confidenceScore }
    }, tx);
    else if (documentType === "site_checklist") await createNotification(env, accountId, userId, {
      type: "site_visit_needed",
      title: "Site visit checklist ready",
      message: `${product.title} created a site-visit checklist for field verification.`,
      severity: "info",
      inquiryId,
      actionLabel: "Open checklist",
      actionRoute: "detail",
      dedupeKey: `site_visit_needed:${documentId}`,
      metadata: { documentId }
    }, tx);
    else await createNotification(env, accountId, userId, {
      type: "system_success",
      title: "Document generated",
      message: `${product.title} was generated and saved.`,
      severity: "success",
      inquiryId,
      actionLabel: "Open docs",
      actionRoute: "docs",
      dedupeKey: `document_generated:${documentId}`,
      metadata: { documentId, documentType }
    }, tx);
    return { documentId, versionId, estimateId, proposalId, aiRunId: aiRun.id, product, documentType, title: product.title, subject: product.subject, body: product.body, currentVersion: 1 };
  });
  const exportFile = await createDocumentExportFile(env, accountId, inquiryId, userId, saved).catch((error) => ({ error: error.message }));
  return { ...saved, exportFile };
}

export async function saveDocumentDraft(env, accountId, inquiryId, userId, payload) {
  const db = getDb(env);
  const saved = await writeGroup(db, async (tx) => {
    const documentType = normalizeDocumentType(payload.documentType || "other");
    const title = payload.title || titleForDocument(documentType);
    const subject = payload.subject || null;
    const body = payload.body || "";
    const metadata = { ...(payload.metadata || {}), manuallyEdited: true, savedBy: userId };
    let document = null;
    if (payload.documentId) {
      [document] = await tx.select({ document: documents }).from(documents).innerJoin(inquiries, eq(inquiries.id, documents.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(documents.inquiryId, inquiryId), eq(documents.id, payload.documentId))).limit(1);
      document = document?.document;
    }
    if (!document) {
      const documentId = id("doc"), versionId = id("docver");
      await tx.insert(documents).values({ id: documentId, inquiryId, documentType, title, status: "draft", currentVersion: 1, createdByUserId: userId, createdAt: now(), updatedAt: now() });
      await tx.insert(documentVersions).values({ id: versionId, documentId, version: 1, subject, body, metadataJson: JSON.stringify(metadata), generatedByAi: false, createdByUserId: userId, createdAt: now() });
      await createActivity(env, accountId, inquiryId, userId, "document.created", `Saved ${title}`, { documentId, versionId, documentType }, tx);
      await createAuditLog(env, accountId, userId, "document", documentId, "document.created", null, { documentType, title, version: 1 }, tx);
      return { documentId, versionId, documentType, title, subject, body, metadata, currentVersion: 1 };
    }
    const conflict = staleUpdate(payload, { ...document, version: document.currentVersion }, "document");
    if (conflict) return conflict;
    const nextVersion = Number(document.currentVersion || 0) + 1;
    const versionId = id("docver");
    await tx.insert(documentVersions).values({ id: versionId, documentId: document.id, version: nextVersion, subject, body, metadataJson: JSON.stringify(metadata), generatedByAi: false, createdByUserId: userId, createdAt: now() });
    await tx.update(documents).set({ title, status: payload.status || "draft", currentVersion: nextVersion, updatedAt: now() }).where(eq(documents.id, document.id));
    await createActivity(env, accountId, inquiryId, userId, "document.version_saved", `Saved ${title} v${nextVersion}`, { documentId: document.id, versionId, documentType }, tx);
    await createAuditLog(env, accountId, userId, "document", document.id, "document.version_saved", { id: document.id, current_version: document.currentVersion, status: document.status }, { id: document.id, current_version: nextVersion, status: payload.status || "draft" }, tx);
    return { documentId: document.id, versionId, documentType, title, subject, body, metadata, currentVersion: nextVersion };
  });
  const exportFile = await createDocumentExportFile(env, accountId, inquiryId, userId, saved).catch((error) => ({ error: error.message }));
  return { ...saved, exportFile };
}

export async function submitProposalForReview(env, accountId, inquiryId, userId, payload = {}) {
  const db = getDb(env);
  return writeGroup(db, async (tx) => {
    const [inquiry] = await tx.select({ id: inquiries.id, title: inquiries.title, status: inquiries.status }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
    if (!inquiry) return null;
    const conditions = [eq(documents.inquiryId, inquiryId), eq(documents.documentType, "proposal")];
    if (payload.documentId) conditions.push(eq(documents.id, payload.documentId));
    const [entry] = await tx.select({ document: documents, version: documentVersions }).from(documents).leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion))).where(and(...conditions)).orderBy(desc(documents.updatedAt)).limit(1);
    if (!entry) return null;
    const conflict = staleUpdate(payload, { ...entry.document, version: entry.document.currentVersion }, "document");
    if (conflict) return conflict;
    const metadata = safeJson(entry.version?.metadataJson) || {};
    await tx.update(documents).set({ status: "review", updatedAt: now() }).where(eq(documents.id, entry.document.id));
    await tx.update(inquiries).set({ status: "review", updatedAt: now() }).where(eq(inquiries.id, inquiryId));
    let [proposal] = await tx.select().from(proposals).where(eq(proposals.documentId, entry.document.id)).orderBy(desc(proposals.createdAt)).limit(1);
    if (proposal) {
      await tx.update(proposals).set({ status: "review", requiresApproval: true, updatedAt: now() }).where(eq(proposals.id, proposal.id));
      [proposal] = await tx.select().from(proposals).where(eq(proposals.id, proposal.id)).limit(1);
    } else {
      const proposalId = id("prop");
      await tx.insert(proposals).values({ id: proposalId, inquiryId, documentId: entry.document.id, status: "review", priceLowCents: metadata.estimate?.lowCents || null, priceHighCents: metadata.estimate?.highCents || null, requiresApproval: true });
      [proposal] = await tx.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
    }
    await createActivity(env, accountId, inquiryId, userId, "proposal.submitted_for_review", `Submitted proposal for ${inquiry.title} to internal review`, { documentId: entry.document.id, versionId: entry.version?.id, proposalId: proposal.id }, tx);
    await createAuditLog(env, accountId, userId, "proposal", proposal.id, "proposal.submitted_for_review", { inquiryStatus: inquiry.status, documentStatus: entry.document.status }, { inquiryStatus: "review", documentStatus: "review", proposalStatus: proposal.status }, tx);
    return { document: { documentId: entry.document.id, versionId: entry.version?.id, documentType: "proposal", title: entry.document.title, subject: entry.version?.subject || null, body: entry.version?.body || "", metadata, currentVersion: entry.document.currentVersion, status: "review" }, proposal: snake(proposal), inquiry: { ...inquiry, status: "review" } };
  });
}

export async function saveEstimateForInquiry(env, accountId, inquiryId, userId, payload = {}) {
  const db = getDb(env);
  return writeGroup(db, async (tx) => {
    const [inquiry] = await tx.select({ id: inquiries.id, title: inquiries.title, status: inquiries.status }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
    if (!inquiry) return null;
    const [{ version: latestVersion }] = await tx.select({ version: max(estimates.version) }).from(estimates).where(eq(estimates.inquiryId, inquiryId));
    const version = Number(latestVersion || 0) + 1;
    const estimateId = id("est");
    const lowCents = Math.round(Number(payload.lowCents)), highCents = Math.round(Number(payload.highCents));
    const assumptions = String(payload.assumptions || "Estimate saved from mobile estimate workflow.").slice(0, 2000);
    await tx.insert(estimates).values({ id: estimateId, inquiryId, version, status: "approved", lowCents, highCents, assumptions, createdByUserId: userId, approvedAt: now() });
    const lines = normalizeEstimateLines(payload.lineItems, lowCents);
    if (lines.length) await tx.insert(estimateLines).values(lines.map((line) => ({ id: id("line"), estimateId, lineType: line.lineType, description: line.description, quantity: line.quantity, unit: line.unit, unitCostCents: line.unitCostCents, totalCents: Math.round(line.quantity * line.unitCostCents) })));
    await tx.update(inquiries).set({ estimatedLowCents: lowCents, estimatedHighCents: highCents, status: "estimating", updatedAt: now() }).where(eq(inquiries.id, inquiryId));
    const [estimate] = await tx.select().from(estimates).where(eq(estimates.id, estimateId)).limit(1);
    await createActivity(env, accountId, inquiryId, userId, "estimate.saved", `Saved estimate for ${inquiry.title}`, { estimateId, version, lowCents, highCents }, tx);
    await createAuditLog(env, accountId, userId, "estimate", estimateId, "estimate.saved", null, snake(estimate), tx);
    return { estimate: snake(estimate), lineItems: lines, inquiry: { ...inquiry, status: "estimating", estimated_low_cents: lowCents, estimated_high_cents: highCents } };
  });
}

export async function listCommunications(env, accountId, inquiryId) {
  const rows = await getDb(env).select({ communication: communications }).from(communications).innerJoin(inquiries, eq(inquiries.id, communications.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(communications.inquiryId, inquiryId))).orderBy(desc(communications.occurredAt));
  return rows.map((row) => snake(row.communication));
}

export async function listInquiryComments(env, accountId, inquiryId) {
  const rows = await getDb(env).select({
    comment: inquiryComments,
    authorName: users.fullName,
    authorEmail: users.email,
    authorAvatarUrl: users.avatarUrl
  })
    .from(inquiryComments)
    .innerJoin(inquiries, eq(inquiries.id, inquiryComments.inquiryId))
    .leftJoin(users, eq(users.id, inquiryComments.authorUserId))
    .where(and(eq(inquiries.accountId, accountId), eq(inquiryComments.inquiryId, inquiryId)))
    .orderBy(desc(inquiryComments.createdAt))
    .limit(50);
  return rows.map(publicComment);
}

export async function createInquiryComment(env, accountId, inquiryId, userId, payload) {
  const db = getDb(env);
  const body = String(payload.body || "").trim();
  if (!body) return { error: "Comment body is required.", statusCode: 400 };
  const [inquiry] = await db.select({ id: inquiries.id, title: inquiries.title }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
  if (!inquiry) return null;
  const mentionedUsers = await resolveMentionedUsers(env, accountId, body, userId, db);
  const commentId = id("comment");
  const mentions = mentionedUsers.map((user) => ({ id: user.id, email: user.email, fullName: user.fullName }));
  await db.insert(inquiryComments).values({ id: commentId, inquiryId, authorUserId: userId, body, mentionsJson: JSON.stringify(mentions), createdAt: now() });
  await createActivity(env, accountId, inquiryId, userId, "comment.created", mentionedUsers.length ? `Commented with ${mentionedUsers.length} mention${mentionedUsers.length === 1 ? "" : "s"}` : "Added a comment", { commentId, mentions: mentions.map((mention) => mention.id) });
  await createAuditLog(env, accountId, userId, "inquiry_comment", commentId, "comment.created", null, { inquiryId, mentions });
  for (const mentioned of mentionedUsers) {
    await createNotification(env, accountId, mentioned.id, {
      type: "system_success",
      title: "You were mentioned",
      message: `${inquiry.title}: ${body.slice(0, 140)}`,
      severity: "info",
      inquiryId,
      actionLabel: "Open comment",
      actionRoute: "detail",
      dedupeKey: `comment_mention:${commentId}:${mentioned.id}`,
      metadata: { commentId, mentionedBy: userId }
    });
  }
  return (await listInquiryComments(env, accountId, inquiryId)).find((comment) => comment.id === commentId);
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
    await createNotification(env, accountId, userId, {
      type: "system_success",
      title: "Follow-up queued",
      message: `The ${channelLabel(channel)} follow-up is queued for provider setup.`,
      severity: "success",
      inquiryId,
      actionLabel: "View communication",
      actionRoute: "detail",
      dedupeKey: `follow_up_queued:${communication.id}`,
      metadata: { communicationId: communication.id, deliveryId: delivery.id, channel }
    });
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
    await createNotification(env, accountId, userId, {
      type: response.ok ? "system_success" : "system_error",
      title: response.ok ? "Follow-up sent" : "Follow-up failed",
      message: response.ok ? `The ${channelLabel(channel)} follow-up was sent.` : `The ${channelLabel(channel)} provider returned ${response.status}.`,
      severity: response.ok ? "success" : "error",
      inquiryId,
      actionLabel: "View communication",
      actionRoute: "detail",
      dedupeKey: `follow_up_${status}:${communication.id}`,
      metadata: { communicationId: communication.id, deliveryId: delivery.id, channel, providerStatus: response.status }
    });
    return { communication: { ...communication, status, external_message_id: externalId }, delivery };
  } catch (error) {
    await db.update(communications).set({ status: "failed" }).where(eq(communications.id, communication.id));
    const delivery = await createDeliveryAttempt(env, communication.id, { provider, status: "failed", request, response: {}, errorMessage: error.message });
    await createNotification(env, accountId, userId, {
      type: "system_error",
      title: "Follow-up failed",
      message: `The ${channelLabel(channel)} follow-up could not be sent: ${error.message}`,
      severity: "error",
      inquiryId,
      actionLabel: "Retry follow-up",
      actionRoute: "email",
      dedupeKey: `follow_up_failed:${communication.id}`,
      metadata: { communicationId: communication.id, deliveryId: delivery.id, channel, error: error.message }
    });
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
  const scheduled = await writeGroup(db, async (tx) => {
    const [inquiry] = await tx.select({ id: inquiries.id, title: inquiries.title, siteId: inquiries.siteId }).from(inquiries).where(and(eq(inquiries.accountId, accountId), eq(inquiries.id, inquiryId))).limit(1);
    if (!inquiry) return null;
    const [existing] = await tx.select().from(siteVisits).where(and(eq(siteVisits.inquiryId, inquiryId), inArray(siteVisits.status, ["needed", "scheduled"]))).orderBy(desc(siteVisits.createdAt)).limit(1);
    const scheduledStart = payload.scheduledStart || defaultSiteVisitStart();
    const scheduledEnd = payload.scheduledEnd || addHours(scheduledStart, 1);
    const notes = payload.notes || "Site visit scheduled from mobile workflow.";
    const visitId = existing?.id || id("visit");
    if (existing) await tx.update(siteVisits).set({ scheduledStart, scheduledEnd, status: "scheduled", assignedUserId: userId, notes, updatedAt: now() }).where(eq(siteVisits.id, visitId));
    else await tx.insert(siteVisits).values({ id: visitId, inquiryId, siteId: inquiry.siteId || null, scheduledStart, scheduledEnd, status: "scheduled", assignedUserId: userId, notes, createdAt: now(), updatedAt: now() });
    await ensureChecklistItems(env, visitId, payload.checklist || defaultChecklistLabels(), tx);
    await tx.update(inquiries).set({ status: "site_visit", updatedAt: now() }).where(eq(inquiries.id, inquiryId));
    const calendarSync = await queueCalendarHold(env, accountId, inquiryId, userId, { visitId, title: `Site visit: ${inquiry.title}`, scheduledStart, scheduledEnd }, tx);
    const [siteVisit] = await tx.select().from(siteVisits).where(eq(siteVisits.id, visitId)).limit(1);
    await createActivity(env, accountId, inquiryId, userId, "site_visit.scheduled", `Scheduled site visit for ${inquiry.title}`, { visitId, scheduledStart, scheduledEnd, calendarSyncId: calendarSync.id }, tx);
    await createNotification(env, accountId, userId, {
      type: "site_visit_needed",
      title: existing ? "Site visit rescheduled" : "Site visit scheduled",
      message: `Site visit for ${inquiry.title} is scheduled for ${new Date(scheduledStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
      severity: "info",
      inquiryId,
      actionLabel: "Prepare visit",
      actionRoute: "detail",
      dedupeKey: `site_visit_scheduled:${visitId}:${scheduledStart}`,
      metadata: { visitId, scheduledStart, scheduledEnd, calendarSyncStatus: calendarSync.status }
    }, tx);
    await createAuditLog(env, accountId, userId, "site_visit", visitId, existing ? "site_visit.rescheduled" : "site_visit.scheduled", existing ? snake(existing) : null, snake(siteVisit), tx);
    return { visitId, siteVisit, calendarSync };
  });
  if (!scheduled) return null;
  return { siteVisit: { ...snake(scheduled.siteVisit), checklistItems: (await listSiteVisits(env, accountId, inquiryId)).find((visit) => visit.id === scheduled.visitId)?.checklistItems || [] }, calendarSync: scheduled.calendarSync };
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
  if (file.contentHash) {
    const existing = await getFileByContentHash(env, accountId, inquiryId, file.contentHash, db);
    if (existing) {
      await createActivity(env, accountId, inquiryId, userId, "file.duplicate_detected", `Skipped duplicate upload ${file.fileName}`, { fileId: existing.id, contentHash: file.contentHash, duplicateFileName: file.fileName }, db);
      return { ...existing, duplicate: true };
    }
  }
  const fileId = id("file");
  await db.insert(files).values({ id: fileId, inquiryId, siteId: inquiry.siteId || null, fileName: file.fileName, contentType: file.contentType, storageKey: file.storageKey, sizeBytes: file.sizeBytes, contentHash: file.contentHash || null, thumbnailStorageKey: file.thumbnailStorageKey || null, thumbnailContentType: file.thumbnailContentType || null, thumbnailStatus: file.thumbnailStatus || "pending", thumbnailGeneratedAt: file.thumbnailGeneratedAt || null, category: file.category, uploadedByUserId: userId });
  await createActivity(env, accountId, inquiryId, userId, "file.uploaded", `Uploaded ${file.fileName}`, { fileId, category: file.category, sizeBytes: file.sizeBytes, contentHash: file.contentHash || null, thumbnailStatus: file.thumbnailStatus || "pending" });
  const resolvedRequirementIds = await resolveRequirementsForUploadedFile(env, accountId, inquiryId, userId, file, db);
  if (resolvedRequirementIds.length) await createNotification(env, accountId, userId, {
    type: "system_success",
    title: "Missing information received",
    message: `${fileCategoryLabel(file.category)} upload completed ${resolvedRequirementIds.length} missing ${resolvedRequirementIds.length === 1 ? "item" : "items"}.`,
    severity: "success",
    inquiryId,
    actionLabel: "Review lead",
    actionRoute: "detail",
    dedupeKey: `missing_received_from_file:${fileId}`,
    metadata: { fileId, category: file.category, requirementIds: resolvedRequirementIds }
  });
  return { id: fileId, ...file };
}

export async function getFileByContentHash(env, accountId, inquiryId, contentHash, db = getDb(env)) {
  if (!contentHash) return null;
  const [row] = await db.select({ file: files }).from(files).innerJoin(inquiries, eq(inquiries.id, files.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(files.inquiryId, inquiryId), eq(files.contentHash, contentHash))).limit(1);
  return row ? snake(row.file) : null;
}

export async function deleteFileRecord(env, accountId, fileId, userId) {
  const db = getDb(env);
  const [row] = await db.select({ file: files, inquiry: inquiries })
    .from(files)
    .innerJoin(inquiries, eq(inquiries.id, files.inquiryId))
    .where(and(eq(inquiries.accountId, accountId), eq(files.id, fileId)))
    .limit(1);
  if (!row) return null;
  if (!env?.FILES?.delete) throw new Error("File storage deletion is not available.");

  const before = snake(row.file);
  await env.FILES.delete(row.file.storageKey);
  if (row.file.thumbnailStorageKey) await env.FILES.delete(row.file.thumbnailStorageKey);
  await writeGroup(db, async (tx) => {
    await tx.delete(files).where(eq(files.id, fileId));
    await createActivity(env, accountId, row.file.inquiryId, userId, "file.deleted", `Deleted ${row.file.fileName}`, { fileId, category: row.file.category }, tx);
    await createAuditLog(env, accountId, userId, "file", fileId, "file.deleted", before, null, tx);
  });
  return { id: fileId, inquiryId: row.file.inquiryId, fileName: row.file.fileName, storageKey: row.file.storageKey };
}

export async function getFileRetentionPolicy(env, accountId) {
  const [policy] = await getDb(env).select().from(fileRetentionPolicies).where(eq(fileRetentionPolicies.accountId, accountId)).limit(1);
  return policy ? publicRetentionPolicy(policy) : defaultRetentionPolicy(accountId);
}

export async function updateFileRetentionPolicy(env, accountId, userId, payload) {
  const db = getDb(env);
  const before = await getFileRetentionPolicy(env, accountId);
  const policy = {
    accountId,
    retentionDays: Number(payload.retentionDays || 365),
    archiveAfterDays: Number(payload.archiveAfterDays || Math.min(180, Number(payload.retentionDays || 365))),
    legalHold: Boolean(payload.legalHold),
    updatedByUserId: userId,
    updatedAt: now()
  };
  const [existing] = await db.select().from(fileRetentionPolicies).where(eq(fileRetentionPolicies.accountId, accountId)).limit(1);
  if (existing) await db.update(fileRetentionPolicies).set(policy).where(eq(fileRetentionPolicies.accountId, accountId));
  else await db.insert(fileRetentionPolicies).values(policy);
  const after = await getFileRetentionPolicy(env, accountId);
  await createAuditLog(env, accountId, userId, "file_retention_policy", accountId, "file_retention_policy.updated", before, after);
  return after;
}

export async function runFileRetentionCleanup(env, accountId, userId, options = {}) {
  const policy = await getFileRetentionPolicy(env, accountId);
  const limit = Math.min(Number(options.limit || 50), 200);
  const cutoff = new Date(Date.now() - Number(policy.retention_days || 365) * 86_400_000).toISOString();
  const db = getDb(env);
  const rows = policy.legal_hold ? [] : await db.select({ file: files, inquiryTitle: inquiries.title, companyName: companies.name })
    .from(files)
    .innerJoin(inquiries, eq(inquiries.id, files.inquiryId))
    .leftJoin(companies, eq(companies.id, inquiries.companyId))
    .where(and(eq(inquiries.accountId, accountId), lt(files.uploadedAt, cutoff)))
    .orderBy(asc(files.uploadedAt))
    .limit(limit);
  const candidates = rows.map((row) => ({ ...snake(row.file), inquiry_title: row.inquiryTitle, company_name: row.companyName }));
  const dryRun = options.dryRun !== false;
  const deleted = [];
  if (!dryRun && candidates.length) {
    if (!env?.FILES?.delete) throw new Error("File storage deletion is not available.");
    for (const candidate of candidates) {
      await env.FILES.delete(candidate.storage_key);
      if (candidate.thumbnail_storage_key) await env.FILES.delete(candidate.thumbnail_storage_key);
      await db.delete(files).where(eq(files.id, candidate.id));
      deleted.push(candidate.id);
    }
  }
  await createAuditLog(env, accountId, userId, "file_retention_policy", accountId, dryRun ? "file_retention_policy.cleanup_previewed" : "file_retention_policy.cleanup_run", null, { cutoff, dryRun, candidateCount: candidates.length, deletedCount: deleted.length, legalHold: policy.legal_hold });
  return { policy, dryRun, cutoff, candidateCount: candidates.length, deletedCount: deleted.length, legalHold: policy.legal_hold, candidates: candidates.map(publicRetentionCandidate) };
}

export async function createDocumentExportFile(env, accountId, inquiryId, userId, document) {
  if (!env?.FILES?.put) return null;
  const fileName = `${safeSlug(document.title || document.documentType || "document")}-v${document.currentVersion || 1}.pdf`;
  const storageKey = `accounts/${accountId}/inquiries/${inquiryId}/document-exports/${document.documentId || id("doc")}-${document.versionId || "latest"}.pdf`;
  const bytes = createPdfBytes({
    title: document.title || titleForDocument(document.documentType),
    subject: document.subject || null,
    body: document.body || "",
    documentType: document.documentType || "document",
    version: document.currentVersion || 1
  });
  await env.FILES.put(storageKey, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      accountId,
      inquiryId,
      documentId: document.documentId || "",
      versionId: document.versionId || "",
      documentType: document.documentType || "document",
      generatedFrom: "document_version"
    }
  });
  const thumbnail = await storeFileThumbnail(env, accountId, inquiryId, fileName, "application/pdf", "document_export", document.title || titleForDocument(document.documentType));
  return createFileRecord(env, accountId, inquiryId, userId, {
    fileName,
    contentType: "application/pdf",
    storageKey,
    sizeBytes: bytes.byteLength,
    contentHash: await sha256Hex(bytes),
    ...thumbnail,
    category: "document_export"
  });
}

export async function rebuildDocumentExportObject(env, fileId, accountId = null) {
  if (!env?.FILES?.put) return null;
  const db = getDb(env);
  const predicates = [eq(files.id, fileId)];
  if (accountId) predicates.push(eq(inquiries.accountId, accountId));
  const [entry] = await db.select({ file: files, inquiry: inquiries })
    .from(files)
    .innerJoin(inquiries, eq(inquiries.id, files.inquiryId))
    .where(and(...predicates))
    .limit(1);
  if (!entry || entry.file.category !== "document_export" || entry.file.contentType !== "application/pdf") return null;
  const ids = documentExportIdsFromStorageKey(entry.file.storageKey);
  if (!ids) return null;
  const [versionRow] = await db.select({ document: documents, version: documentVersions })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(and(eq(documents.inquiryId, entry.file.inquiryId), eq(documents.id, ids.documentId), eq(documentVersions.id, ids.versionId)))
    .limit(1);
  if (!versionRow) return null;
  const bytes = createPdfBytes({
    title: versionRow.document.title || titleForDocument(versionRow.document.documentType),
    subject: versionRow.version.subject || null,
    body: versionRow.version.body || "",
    documentType: versionRow.document.documentType || "document",
    version: versionRow.version.version || versionRow.document.currentVersion || 1
  });
  await env.FILES.put(entry.file.storageKey, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      accountId: entry.inquiry.accountId,
      inquiryId: entry.file.inquiryId,
      documentId: ids.documentId,
      versionId: ids.versionId,
      documentType: versionRow.document.documentType || "document",
      generatedFrom: "document_version_repair"
    }
  });
  await db.update(files).set({ sizeBytes: bytes.byteLength, contentHash: await sha256Hex(bytes) }).where(eq(files.id, fileId));
  return getFileForDownload(env, entry.inquiry.accountId, fileId);
}

export async function listFilesForInquiry(env, accountId, inquiryId) {
  const rows = await getDb(env).select({ file: files }).from(files).innerJoin(inquiries, eq(inquiries.id, files.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(files.inquiryId, inquiryId))).orderBy(desc(files.uploadedAt));
  return rows.map(({ file }) => snake(file));
}

export async function getFileForDownload(env, accountId, fileId) {
  const [row] = await getDb(env).select({ file: files }).from(files).innerJoin(inquiries, eq(inquiries.id, files.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(files.id, fileId))).limit(1);
  return row ? snake(row.file) : null;
}

export async function createFileShareLink(env, accountId, fileId, userId, origin, options = {}) {
  const db = getDb(env);
  const [entry] = await db.select({ file: files, inquiry: inquiries }).from(files).innerJoin(inquiries, eq(inquiries.id, files.inquiryId)).where(and(eq(inquiries.accountId, accountId), eq(files.id, fileId))).limit(1);
  if (!entry) return null;
  const token = randomToken(32);
  const shareId = id("share");
  const expiresAt = shareExpiry(options.expiresAt);
  const value = {
    id: shareId,
    accountId,
    fileId,
    inquiryId: entry.file.inquiryId,
    tokenHash: await sha256Hex(new TextEncoder().encode(token)),
    label: options.label || null,
    createdByUserId: userId,
    expiresAt
  };
  await db.insert(fileShareLinks).values(value);
  await createActivity(env, accountId, entry.file.inquiryId, userId, "file.share_link_created", `Created external share link for ${entry.file.fileName}`, { fileId, shareId, expiresAt });
  await createAuditLog(env, accountId, userId, "file_share_link", shareId, "share_link.created", null, { fileId, inquiryId: entry.file.inquiryId, expiresAt });
  return publicFileShare(value, token, origin);
}

export async function listFileShareLinks(env, accountId, fileId) {
  const rows = await getDb(env).select().from(fileShareLinks).where(and(eq(fileShareLinks.accountId, accountId), eq(fileShareLinks.fileId, fileId))).orderBy(desc(fileShareLinks.createdAt)).limit(20);
  return rows.map((row) => publicFileShare(row));
}

export async function revokeFileShareLink(env, accountId, shareId, userId) {
  const db = getDb(env);
  const [before] = await db.select({ share: fileShareLinks, fileName: files.fileName }).from(fileShareLinks).innerJoin(files, eq(files.id, fileShareLinks.fileId)).where(and(eq(fileShareLinks.accountId, accountId), eq(fileShareLinks.id, shareId))).limit(1);
  if (!before) return null;
  const revokedAt = now();
  await db.update(fileShareLinks).set({ revokedAt }).where(eq(fileShareLinks.id, shareId));
  await createActivity(env, accountId, before.share.inquiryId, userId, "file.share_link_revoked", `Revoked external share link for ${before.fileName}`, { fileId: before.share.fileId, shareId });
  await createAuditLog(env, accountId, userId, "file_share_link", shareId, "share_link.revoked", snake(before.share), { ...snake(before.share), revoked_at: revokedAt });
  return publicFileShare({ ...before.share, revokedAt });
}

export async function getSharedFileForDownload(env, token) {
  const tokenHash = await sha256Hex(new TextEncoder().encode(String(token || "")));
  const db = getDb(env);
  const [entry] = await db.select({ share: fileShareLinks, file: files }).from(fileShareLinks).innerJoin(files, eq(files.id, fileShareLinks.fileId)).where(eq(fileShareLinks.tokenHash, tokenHash)).limit(1);
  if (!entry || entry.share.revokedAt || new Date(entry.share.expiresAt).getTime() <= Date.now()) return null;
  await db.update(fileShareLinks).set({ lastAccessedAt: now(), accessCount: Number(entry.share.accessCount || 0) + 1 }).where(eq(fileShareLinks.id, entry.share.id));
  return { share: publicFileShare(entry.share), file: snake(entry.file) };
}

async function findOrCreateCompany(env, accountId, company, db = getDb(env)) {
  const [existing] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.accountId, accountId), eq(companies.name, company.name))).limit(1);
  if (existing) return existing.id;
  const companyId = id("co");
  await db.insert(companies).values({ id: companyId, accountId, name: company.name, website: company.website || null, industry: company.industry || null });
  return companyId;
}

async function persistExtractedFields(env, inquiryId, sourceId, extraction, db = getDb(env)) {
  const values = [
    ["company_name", "Company", extraction.company.name], ["contact_name", "Contact", extraction.contact.fullName], ["contact_email", "Email", extraction.contact.email], ["contact_phone", "Phone", extraction.contact.phone], ["site_address", "Site address", extraction.site.fullAddress], ["site_city", "City", extraction.site.city], ["site_region", "Region", extraction.site.region], ["service_type", "Service", extraction.service.label], ["lease_end_date", "Lease expiration date", extraction.timeline.leaseEndDate], ["requested_due_date", "Requested due date", extraction.timeline.requestedDueDate], ["access_requirements", "Site access requirements", extraction.site.accessNotes], ["rack_count", "Rack count", extraction.equipment.rackCount == null ? null : String(extraction.equipment.rackCount)], ["equipment_assets", "Equipment", extraction.equipment.assets.join(", ") || null], ["estimate_range", "Estimate range", centsRange(extraction.estimateRange.lowCents, extraction.estimateRange.highCents)]
  ].filter(([, , value]) => value !== null && value !== undefined && value !== "");
  if (values.length) await insertValues(db, extractedFields, values.map(([fieldKey, label, valueText]) => ({ id: id("field"), inquiryId, fieldKey, label, valueText, confidenceScore: extraction.confidenceScore, sourceId })), { onConflictDoNothing: true });
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

async function persistMissingRequirements(env, inquiryId, requirements, db = getDb(env)) {
  if (requirements.length) await insertValues(db, missingRequirements, requirements.map((item) => ({ id: id("miss"), inquiryId, requirementKey: item.key, label: item.label, category: item.category, severity: item.severity, status: "open", notes: item.reason })), { onConflictDoNothing: true });
}

async function createEstimateRecords(env, inquiryId, userId, product, db = getDb(env)) {
  const [{ version: latestVersion }] = await db.select({ version: max(estimates.version) }).from(estimates).where(eq(estimates.inquiryId, inquiryId));
  const estimateId = id("est");
  await db.insert(estimates).values({ id: estimateId, inquiryId, version: Number(latestVersion || 0) + 1, status: product.approvalRequired ? "draft" : "approved", lowCents: product.estimate.lowCents, highCents: product.estimate.highCents, assumptions: product.estimate.assumptions, createdByUserId: userId });
  if (product.estimate.lineItems.length) await insertValues(db, estimateLines, product.estimate.lineItems.map((item) => ({ id: id("line"), estimateId, lineType: item.lineType, description: item.description, quantity: item.quantity || 1, unit: item.unit || "each", unitCostCents: item.unitCostCents || 0, totalCents: Math.round(Number(item.quantity || 1) * Number(item.unitCostCents || 0)) })));
  return estimateId;
}

async function createProposalRecords(env, inquiryId, estimateId, documentId, product, db = getDb(env)) {
  const proposalId = id("prop");
  await db.insert(proposals).values({ id: proposalId, inquiryId, estimateId, documentId, status: product.approvalRequired ? "review" : "draft", priceLowCents: product.estimate.lowCents, priceHighCents: product.estimate.highCents, requiresApproval: product.approvalRequired });
  if (product.sections.length) await insertValues(db, proposalSections, product.sections.map((section, index) => ({ id: id("section"), proposalId, sectionKey: section.key, title: section.title, body: section.body, displayOrder: index + 1 })));
  return proposalId;
}

async function createSiteVisitRecords(env, inquiryId, userId, product, db = getDb(env)) {
  let [visit] = await db.select({ id: siteVisits.id }).from(siteVisits).where(and(eq(siteVisits.inquiryId, inquiryId), inArray(siteVisits.status, ["needed", "scheduled"]))).limit(1);
  const visitId = visit?.id || id("visit");
  if (!visit) await db.insert(siteVisits).values({ id: visitId, inquiryId, status: "needed", assignedUserId: userId, notes: "Generated from AI site checklist workflow." });
  const labels = product.body.split("\n").map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 12);
  await ensureChecklistItems(env, visitId, labels, db);
}

async function ensureChecklistItems(env, visitId, labels, db = getDb(env)) {
  const existing = await db.select({ itemKey: checklistItems.itemKey }).from(checklistItems).where(eq(checklistItems.siteVisitId, visitId));
  const keys = new Set(existing.map((item) => item.itemKey));
  const values = labels.map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 42) || id("item"), label })).filter((item) => !keys.has(item.key)).map((item) => ({ id: id("check"), siteVisitId: visitId, itemKey: item.key, label: item.label, status: "open" }));
  if (values.length) await insertValues(db, checklistItems, values, { onConflictDoNothing: true });
}

async function queueCalendarHold(env, accountId, inquiryId, userId, payload, db = getDb(env)) {
  const [integration] = await db.select({ id: integrationConnections.id }).from(integrationConnections).where(and(
    eq(integrationConnections.accountId, accountId),
    eq(integrationConnections.provider, "calendar"),
    eq(integrationConnections.displayName, "Google Calendar"),
    eq(integrationConnections.status, "connected")
  )).limit(1);
  if (!integration) return { id: null, provider: "calendar", externalId: null, status: "not_connected" };
  const syncId = id("sync"), externalId = `calendar_hold_${payload.visitId}`;
  await db.insert(syncEvents).values({ id: syncId, integrationId: integration.id, inquiryId, status: "queued", operation: "calendar_hold", externalId });
  return { id: syncId, provider: "calendar", externalId, status: "queued" };
}

async function completeVisitIfReady(env, visitId) {
  const db = getDb(env);
  const [{ value }] = await db.select({ value: count(checklistItems.id) }).from(checklistItems).where(and(eq(checklistItems.siteVisitId, visitId), eq(checklistItems.status, "open")));
  if (Number(value || 0) === 0) await db.update(siteVisits).set({ status: "complete", updatedAt: now() }).where(and(eq(siteVisits.id, visitId), ne(siteVisits.status, "cancelled")));
}

async function resolveRequirementsForUploadedFile(env, accountId, inquiryId, userId, file, db = getDb(env)) {
  const patterns = requirementPatternsForFile(file);
  if (!patterns.length) return [];
  const rows = await db.select({ requirement: missingRequirements }).from(missingRequirements).innerJoin(inquiries, eq(inquiries.id, missingRequirements.inquiryId)).where(and(
    eq(inquiries.accountId, accountId),
    eq(missingRequirements.inquiryId, inquiryId),
    inArray(missingRequirements.status, ["open", "requested"])
  ));
  const matched = rows.map(({ requirement }) => requirement).filter((requirement) => requirementMatchesUpload(requirement, patterns));
  if (!matched.length) return [];
  const matchedIds = matched.map((requirement) => requirement.id);
  const resolvedAt = now();
  await db.update(missingRequirements).set({ status: "received", resolvedAt }).where(inArray(missingRequirements.id, matchedIds));
  await createActivity(env, accountId, inquiryId, userId, "missing_requirement.received_from_file", `Marked ${matched.length} missing ${matched.length === 1 ? "item" : "items"} received from ${fileCategoryLabel(file.category)} upload`, { fileName: file.fileName, category: file.category, requirementIds: matchedIds }, db);
  for (const requirement of matched) await createAuditLog(env, accountId, userId, "missing_requirement", requirement.id, "status.updated", snake(requirement), { ...snake(requirement), status: "received", resolved_at: resolvedAt }, db);
  return matchedIds;
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
function integrationWebhook(env, provider) {
  if (provider === "crm") return env.CRM_PROVIDER_WEBHOOK || "";
  if (provider === "storage") return env.STORAGE_PROVIDER_WEBHOOK || "";
  if (provider === "email") return env.EMAIL_PROVIDER_WEBHOOK || env.COMMUNICATION_PROVIDER_WEBHOOK || "";
  return env.INTEGRATION_PROVIDER_WEBHOOK || "";
}
function communicationChannel(channel) { const value = String(channel || "internal_note").toLowerCase(); return ["email", "phone", "text", "internal_note"].includes(value) ? value : "internal_note"; }
function channelLabel(channel) { return ({ email: "email", phone: "call note", text: "text message", internal_note: "internal note" })[channel] || "communication"; }
function communicationWebhook(env, channel) { return channel === "email" ? env.EMAIL_PROVIDER_WEBHOOK || env.COMMUNICATION_PROVIDER_WEBHOOK || "" : channel === "text" ? env.SMS_PROVIDER_WEBHOOK || env.COMMUNICATION_PROVIDER_WEBHOOK || "" : ""; }
function defaultSiteVisitStart() { const date = new Date(); date.setUTCDate(date.getUTCDate() + 2); date.setUTCHours(14, 0, 0, 0); return date.toISOString(); }
function addHours(value, hours) { const date = new Date(value); date.setUTCHours(date.getUTCHours() + hours); return date.toISOString(); }
function defaultChecklistLabels() { return ["Confirm site access window", "Capture room and equipment photos", "Validate rack and equipment inventory", "Confirm electrical disconnect and utility shutoff", "Document escort, security, and loading dock requirements"]; }
function requirementPatternsForFile(file) {
  const category = String(file.category || "");
  const name = String(file.fileName || "").toLowerCase();
  if (category === "floor_plan") return ["floor plan", "site drawing", "drawing", "site plan", "plan"];
  if (category === "equipment_list") return ["equipment list", "equipment inventory", "equipment", "asset", "rack", "cabinet", "quantity", "count"];
  if (category === "contract") return ["contract", "agreement", "msa", "terms", "commercial"];
  if (category === "email_attachment") return ["email attachment", "attachment", "source document", "customer document"];
  if (category === "photo" && /floor|plan|drawing/.test(name)) return ["floor plan", "site drawing", "drawing", "site plan"];
  return [];
}
function requirementMatchesUpload(requirement, patterns) {
  const text = `${requirement.requirementKey || ""} ${requirement.label || ""} ${requirement.notes || ""}`.toLowerCase().replaceAll("_", " ");
  return patterns.some((pattern) => text.includes(pattern));
}
function fileCategoryLabel(category) {
  return ({ floor_plan: "floor plan", equipment_list: "equipment list", contract: "contract", email_attachment: "email attachment", photo: "photo" })[category] || "file";
}
function stageLabel(status) {
  return ({ new: "New", needs_info: "Needs info", estimating: "Estimating", site_visit: "Site visit", proposal: "Proposal", review: "Review", won: "Won", lost: "Lost", archived: "Archived" })[status] || String(status || "Unknown").replaceAll("_", " ");
}
function safeSlug(value) { return String(value || "document").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "document"; }
function documentExportIdsFromStorageKey(storageKey) {
  const match = String(storageKey || "").match(/\/document-exports\/(doc_[^-]+(?:-[^-]+)*)-(docver_[^.]+)\.pdf$/);
  return match ? { documentId: match[1], versionId: match[2] } : null;
}
export async function storeFileThumbnail(env, accountId, inquiryId, fileName, contentType, category, title = "") {
  if (!env?.FILES?.put || !isThumbnailCandidate(contentType)) return { thumbnailStatus: "unavailable" };
  const thumbnailStorageKey = `accounts/${accountId}/inquiries/${inquiryId}/thumbnails/${crypto.randomUUID()}-${safeSlug(fileName)}.svg`;
  const thumbnailContentType = "image/svg+xml";
  const bytes = createThumbnailSvgBytes({ fileName, contentType, category, title });
  await env.FILES.put(thumbnailStorageKey, bytes, {
    httpMetadata: { contentType: thumbnailContentType },
    customMetadata: { accountId, inquiryId, fileName, sourceContentType: contentType, category, generatedFrom: "thumbnail" }
  });
  return { thumbnailStorageKey, thumbnailContentType, thumbnailStatus: "generated", thumbnailGeneratedAt: now() };
}
function isThumbnailCandidate(contentType) {
  return String(contentType || "").startsWith("image/") || String(contentType || "") === "application/pdf";
}
function createThumbnailSvgBytes(file) {
  const type = String(file.contentType || "").startsWith("image/") ? "Image" : String(file.contentType || "").includes("pdf") ? "PDF" : "File";
  const title = svgText(file.title || file.fileName || "File preview", 36);
  const subtitle = svgText(`${type} - ${fileCategoryLabel(file.category)}`, 42);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240" role="img" aria-label="${svgEscape(title)} thumbnail"><rect width="320" height="240" rx="18" fill="#f3f8ef"/><rect x="20" y="20" width="280" height="200" rx="14" fill="#ffffff" stroke="#b7e6a8" stroke-width="2"/><rect x="42" y="44" width="72" height="86" rx="8" fill="#e5f1dc"/><path d="M94 44v24h20" fill="#d5e9c6"/><text x="42" y="160" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#2e4e1a">${svgEscape(type)}</text><text x="42" y="188" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#191919">${svgEscape(title)}</text><text x="42" y="210" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#666a6d">${svgEscape(subtitle)}</text></svg>`;
  return new TextEncoder().encode(svg);
}
function svgText(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}...` : text;
}
function svgEscape(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}
function createPdfBytes(document) {
  const lines = [
    document.title || "Document",
    document.subject ? `Subject: ${document.subject}` : null,
    `${String(document.documentType || "document").replaceAll("_", " ")} / Version ${document.version || 1}`,
    "",
    ...wrapPdfText(document.body || "No document body.")
  ].filter((line) => line !== null).slice(0, 95);
  const content = [
    "BT",
    "/F1 18 Tf",
    "72 750 Td",
    `(${escapePdfText(lines[0])}) Tj`,
    "/F1 10 Tf",
    ...lines.slice(1).flatMap((line) => ["0 -16 Td", `(${escapePdfText(line)}) Tj`]),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
function wrapPdfText(value) {
  const words = String(value).replace(/\r/g, "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!word) continue;
    if (`${line} ${word}`.trim().length > 88) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
function escapePdfText(value) { return String(value).replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function normalizeEstimateLines(lines, lowCents) { const fallback = [{ lineType: "labor", description: "Labor", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .42) }, { lineType: "logistics", description: "Logistics", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .18) }, { lineType: "recycling", description: "Recycling", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .16) }, { lineType: "contingency", description: "Contingency", quantity: 1, unit: "each", unitCostCents: Math.round(lowCents * .1) }]; return (Array.isArray(lines) && lines.length ? lines : fallback).slice(0, 24).map((line) => ({ lineType: estimateLineType(line.lineType), description: String(line.description || "Estimate line item").slice(0, 240), quantity: Number(line.quantity || 1), unit: String(line.unit || "each").slice(0, 40), unitCostCents: Math.round(Number(line.unitCostCents || 0)) })).filter((line) => Number.isFinite(line.quantity) && Number.isFinite(line.unitCostCents) && line.unitCostCents >= 0); }
function estimateLineType(type) { const value = String(type || "other").toLowerCase(); return ["labor", "logistics", "recycling", "equipment", "subcontractor", "contingency", "other"].includes(value) ? value : "other"; }
function safeJson(value) { if (!value) return null; try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; } }
function snake(row) { return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`), value])); }
function publicSavedView(row) { return { ...snake(row), filters: safeJson(row?.filtersJson || row?.filters_json) || {}, sort: safeJson(row?.sortJson || row?.sort_json) || {} }; }
function publicNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    status: row.status,
    createdAt: row.createdAt || row.created_at,
    readAt: row.readAt || row.read_at || null,
    archivedAt: row.archivedAt || row.archived_at || null,
    relatedInquiryId: row.inquiryId || row.inquiry_id || null,
    actionLabel: row.actionLabel || row.action_label || null,
    actionRoute: row.actionRoute || row.action_route || null,
    metadata: safeJson(row.metadataJson || row.metadata_json) || {}
  };
}
function publicComment(row) {
  const comment = snake(row.comment || row);
  return {
    ...comment,
    mentions: safeJson(comment.mentions_json) || [],
    author_name: row.authorName || row.author_name || null,
    author_email: row.authorEmail || row.author_email || null,
    author_avatar_url: row.authorAvatarUrl || row.author_avatar_url || null
  };
}
function publicFileShare(row, token = null, origin = "") {
  const item = snake(row || {});
  const publicUrl = token ? `${origin || ""}/share/files/${encodeURIComponent(token)}` : null;
  return {
    id: item.id,
    fileId: item.file_id,
    inquiryId: item.inquiry_id,
    label: item.label,
    createdAt: item.created_at,
    expiresAt: item.expires_at,
    revokedAt: item.revoked_at || null,
    lastAccessedAt: item.last_accessed_at || null,
    accessCount: Number(item.access_count || 0),
    active: !item.revoked_at && new Date(item.expires_at).getTime() > Date.now(),
    ...(publicUrl ? { publicUrl } : {})
  };
}
function defaultRetentionPolicy(accountId) {
  return { account_id: accountId, retention_days: 365, archive_after_days: 180, legal_hold: false, updated_by_user_id: null, updated_at: null };
}
function publicRetentionPolicy(row) {
  const item = snake(row || {});
  return {
    account_id: item.account_id,
    retention_days: Number(item.retention_days || 365),
    archive_after_days: Number(item.archive_after_days || 180),
    legal_hold: Boolean(item.legal_hold),
    updated_by_user_id: item.updated_by_user_id || null,
    updated_at: item.updated_at || null
  };
}
function publicRetentionCandidate(file) {
  return {
    id: file.id,
    file_name: file.file_name,
    category: file.category,
    size_bytes: file.size_bytes,
    uploaded_at: file.uploaded_at,
    inquiry_id: file.inquiry_id,
    inquiry_title: file.inquiry_title || null,
    company_name: file.company_name || null
  };
}
function staleUpdate(payload = {}, current = {}, entityType = "resource") {
  const expectedUpdatedAt = payload.expectedUpdatedAt || payload.expected_updated_at;
  const currentUpdatedAt = current.updatedAt || current.updated_at;
  if (expectedUpdatedAt && currentUpdatedAt && String(expectedUpdatedAt) !== String(currentUpdatedAt)) return staleResource(entityType, { expectedUpdatedAt, currentUpdatedAt });
  const expectedVersion = payload.expectedVersion ?? payload.expected_version;
  const currentVersion = current.currentVersion ?? current.current_version ?? current.version;
  if (expectedVersion != null && currentVersion != null && Number(expectedVersion) !== Number(currentVersion)) return staleResource(entityType, { expectedVersion: Number(expectedVersion), currentVersion: Number(currentVersion) });
  return null;
}
function staleResource(entityType, detail) {
  return {
    error: "This record changed after it was loaded. Refresh and try again.",
    code: "stale_resource",
    entityType,
    detail,
    statusCode: 409
  };
}
function randomToken(bytes = 32) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function shareExpiry(value) {
  const fallback = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const parsed = value ? new Date(value).getTime() : fallback;
  const max = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const chosen = Number.isFinite(parsed) && parsed > Date.now() ? Math.min(parsed, max) : fallback;
  return new Date(chosen).toISOString();
}
async function resolveMentionedUsers(env, accountId, body, actorUserId, db = getDb(env)) {
  const text = String(body || "").toLowerCase();
  const candidates = await db.select({ id: users.id, email: users.email, fullName: users.fullName }).from(users).where(and(eq(users.accountId, accountId), eq(users.isActive, true)));
  return candidates.filter((user) => {
    if (user.id === actorUserId) return false;
    const email = user.email.toLowerCase();
    const handle = mentionHandle(user.fullName || user.email);
    return text.includes(`@${email}`) || text.includes(email) || (handle && text.includes(`@${handle}`));
  });
}
function mentionHandle(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, ""); }
function normalizeNotificationType(value) {
  const type = String(value || "system_success");
  return NOTIFICATION_TYPES.has(type) ? type : "system_success";
}
function normalizeNotificationSeverity(value) {
  const severity = String(value || "info");
  return NOTIFICATION_SEVERITIES.has(severity) ? severity : "info";
}
function normalizeNotificationStatus(value) {
  const status = String(value || "read");
  return NOTIFICATION_STATUSES.has(status) ? status : "read";
}
function notificationTitle(type) {
  return ({
    lead_created: "New lead received",
    extraction_complete: "AI extraction complete",
    extraction_low_confidence: "Low-confidence extraction",
    missing_information: "Missing project information",
    follow_up_needed: "Follow-up needed",
    proposal_ready: "Proposal ready",
    site_visit_needed: "Site visit needed",
    status_changed: "Lead status changed",
    system_success: "Action completed",
    system_error: "Action needs attention"
  })[type] || "Notification";
}
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
async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
