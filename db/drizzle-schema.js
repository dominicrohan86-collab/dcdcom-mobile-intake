import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updated = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const jsonText = (name, fallback = "{}") => text(name).notNull().default(fallback);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), name: text("name").notNull(), domain: text("domain"), createdAt: now(), updatedAt: updated()
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), email: text("email").notNull().unique(), fullName: text("full_name").notNull(), role: text("role").notNull(), avatarUrl: text("avatar_url"), isActive: integer("is_active", { mode: "boolean" }).notNull().default(true), createdAt: now(), updatedAt: updated()
}, (table) => [index("idx_users_account").on(table.accountId)]);

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }), defaultView: text("default_view").notNull().default("today"), notificationDigest: text("notification_digest").notNull().default("daily"), timezone: text("timezone").notNull().default("America/New_York"), settingsJson: jsonText("settings_json"), updatedAt: updated()
});

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), name: text("name").notNull(), website: text("website"), industry: text("industry"), notes: text("notes"), createdAt: now(), updatedAt: updated()
}, (table) => [uniqueIndex("uq_companies_account_name").on(table.accountId, table.name)]);

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }), fullName: text("full_name").notNull(), title: text("title"), email: text("email"), phone: text("phone"), preferredChannel: text("preferred_channel"), createdAt: now(), updatedAt: updated()
}, (table) => [index("idx_contacts_company").on(table.companyId)]);

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }), name: text("name").notNull(), addressLine1: text("address_line1"), addressLine2: text("address_line2"), city: text("city"), region: text("region"), postalCode: text("postal_code"), country: text("country").notNull().default("US"), timezone: text("timezone"), siteType: text("site_type"), accessNotes: text("access_notes"), createdAt: now(), updatedAt: updated()
}, (table) => [index("idx_sites_company").on(table.companyId)]);

export const inquiries = sqliteTable("inquiries", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }), contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }), siteId: text("site_id").references(() => sites.id, { onDelete: "set null" }), ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }), title: text("title").notNull(), serviceType: text("service_type").notNull(), sourceChannel: text("source_channel").notNull(), priority: text("priority").notNull().default("medium"), workload: text("workload").notNull().default("medium"), status: text("status").notNull().default("new"), estimatedLowCents: integer("estimated_low_cents"), estimatedHighCents: integer("estimated_high_cents"), confidenceScore: integer("confidence_score").notNull().default(0), leaseEndDate: text("lease_end_date"), requestedDueDate: text("requested_due_date"), receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`), lastCustomerActivityAt: text("last_customer_activity_at"), createdAt: now(), updatedAt: updated()
}, (table) => [index("idx_inquiries_account_status").on(table.accountId, table.status, table.priority, table.receivedAt), index("idx_inquiries_owner").on(table.ownerUserId, table.status, table.receivedAt), index("idx_inquiries_company").on(table.companyId, table.receivedAt)]);

export const inquirySources = sqliteTable("inquiry_sources", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), channel: text("channel").notNull(), subject: text("subject"), sender: text("sender"), rawText: text("raw_text").notNull(), externalMessageId: text("external_message_id"), capturedByUserId: text("captured_by_user_id").references(() => users.id, { onDelete: "set null" }), capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const extractedFields = sqliteTable("extracted_fields", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), fieldKey: text("field_key").notNull(), label: text("label").notNull(), valueText: text("value_text"), valueJson: text("value_json"), confidenceScore: integer("confidence_score").notNull().default(0), sourceId: text("source_id").references(() => inquirySources.id, { onDelete: "set null" }), isVerified: integer("is_verified", { mode: "boolean" }).notNull().default(false), verifiedByUserId: text("verified_by_user_id").references(() => users.id, { onDelete: "set null" }), verifiedAt: text("verified_at"), createdAt: now()
}, (table) => [uniqueIndex("uq_extracted_inquiry_key").on(table.inquiryId, table.fieldKey), index("idx_extracted_inquiry").on(table.inquiryId, table.fieldKey)]);

export const missingRequirements = sqliteTable("missing_requirements", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), requirementKey: text("requirement_key").notNull(), label: text("label").notNull(), category: text("category").notNull(), severity: text("severity").notNull().default("medium"), status: text("status").notNull().default("open"), requestedAt: text("requested_at"), resolvedAt: text("resolved_at"), notes: text("notes")
}, (table) => [uniqueIndex("uq_missing_inquiry_key").on(table.inquiryId, table.requirementKey), index("idx_missing_inquiry_status").on(table.inquiryId, table.status, table.severity)]);

export const aiSummaries = sqliteTable("ai_summaries", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), summaryType: text("summary_type").notNull(), body: text("body").notNull(), modelName: text("model_name"), confidenceScore: integer("confidence_score"), generatedByUserId: text("generated_by_user_id").references(() => users.id, { onDelete: "set null" }), generatedAt: text("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const aiRuns = sqliteTable("ai_runs", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), inquiryId: text("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }), runType: text("run_type").notNull(), provider: text("provider").notNull().default("openai"), modelName: text("model_name"), status: text("status").notNull(), inputPreview: text("input_preview"), outputJson: text("output_json"), errorMessage: text("error_message"), latencyMs: integer("latency_ms"), createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }), createdAt: now()
}, (table) => [index("idx_ai_runs_account_type").on(table.accountId, table.runType, table.createdAt), index("idx_ai_runs_inquiry").on(table.inquiryId, table.createdAt)]);

export const estimates = sqliteTable("estimates", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), version: integer("version").notNull().default(1), status: text("status").notNull().default("draft"), lowCents: integer("low_cents").notNull(), highCents: integer("high_cents").notNull(), targetMarginBps: integer("target_margin_bps"), assumptions: text("assumptions"), createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }), createdAt: now(), approvedAt: text("approved_at")
}, (table) => [uniqueIndex("uq_estimates_inquiry_version").on(table.inquiryId, table.version)]);

export const estimateLines = sqliteTable("estimate_lines", {
  id: text("id").primaryKey(), estimateId: text("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }), lineType: text("line_type").notNull(), description: text("description").notNull(), quantity: real("quantity").notNull().default(1), unit: text("unit").notNull().default("each"), unitCostCents: integer("unit_cost_cents").notNull(), totalCents: integer("total_cents").notNull()
});

export const siteVisits = sqliteTable("site_visits", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), siteId: text("site_id").references(() => sites.id, { onDelete: "set null" }), scheduledStart: text("scheduled_start"), scheduledEnd: text("scheduled_end"), status: text("status").notNull().default("needed"), assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }), notes: text("notes"), createdAt: now(), updatedAt: updated()
});

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(), siteVisitId: text("site_visit_id").notNull().references(() => siteVisits.id, { onDelete: "cascade" }), itemKey: text("item_key").notNull(), label: text("label").notNull(), status: text("status").notNull().default("open"), completedByUserId: text("completed_by_user_id").references(() => users.id, { onDelete: "set null" }), completedAt: text("completed_at"), notes: text("notes")
}, (table) => [uniqueIndex("uq_checklist_visit_key").on(table.siteVisitId, table.itemKey)]);

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), documentType: text("document_type").notNull(), title: text("title").notNull(), status: text("status").notNull().default("draft"), currentVersion: integer("current_version").notNull().default(1), createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }), createdAt: now(), updatedAt: updated()
}, (table) => [index("idx_documents_inquiry_type").on(table.inquiryId, table.documentType, table.status)]);

export const documentVersions = sqliteTable("document_versions", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }), version: integer("version").notNull(), subject: text("subject"), body: text("body").notNull(), metadataJson: jsonText("metadata_json"), generatedByAi: integer("generated_by_ai", { mode: "boolean" }).notNull().default(false), createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }), createdAt: now()
}, (table) => [uniqueIndex("uq_document_versions").on(table.documentId, table.version)]);

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), estimateId: text("estimate_id").references(() => estimates.id, { onDelete: "set null" }), documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }), status: text("status").notNull().default("draft"), priceLowCents: integer("price_low_cents"), priceHighCents: integer("price_high_cents"), requiresApproval: integer("requires_approval", { mode: "boolean" }).notNull().default(true), sentAt: text("sent_at"), createdAt: now(), updatedAt: updated()
});

export const proposalSections = sqliteTable("proposal_sections", {
  id: text("id").primaryKey(), proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }), sectionKey: text("section_key").notNull(), title: text("title").notNull(), body: text("body").notNull(), displayOrder: integer("display_order").notNull()
}, (table) => [uniqueIndex("uq_proposal_sections").on(table.proposalId, table.sectionKey)]);

export const communications = sqliteTable("communications", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }), contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }), direction: text("direction").notNull(), channel: text("channel").notNull(), subject: text("subject"), body: text("body").notNull(), status: text("status").notNull().default("logged"), externalMessageId: text("external_message_id"), createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }), occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("idx_communications_inquiry").on(table.inquiryId, table.occurredAt)]);

export const communicationDeliveryAttempts = sqliteTable("communication_delivery_attempts", {
  id: text("id").primaryKey(), communicationId: text("communication_id").notNull().references(() => communications.id, { onDelete: "cascade" }), provider: text("provider").notNull(), status: text("status").notNull(), attemptNumber: integer("attempt_number").notNull().default(1), requestJson: jsonText("request_json"), responseJson: jsonText("response_json"), errorMessage: text("error_message"), createdAt: now()
}, (table) => [index("idx_delivery_communication").on(table.communicationId, table.createdAt)]);

export const files = sqliteTable("files", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").references(() => inquiries.id, { onDelete: "cascade" }), siteId: text("site_id").references(() => sites.id, { onDelete: "set null" }), fileName: text("file_name").notNull(), contentType: text("content_type").notNull(), storageKey: text("storage_key").notNull(), sizeBytes: integer("size_bytes"), category: text("category").notNull(), uploadedByUserId: text("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }), uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, (table) => [index("idx_files_inquiry").on(table.inquiryId, table.category)]);

export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), inquiryId: text("inquiry_id").references(() => inquiries.id, { onDelete: "cascade" }), actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }), eventType: text("event_type").notNull(), summary: text("summary").notNull(), metadataJson: jsonText("metadata_json"), createdAt: now()
}, (table) => [index("idx_activity_inquiry").on(table.inquiryId, table.createdAt)]);

export const integrationConnections = sqliteTable("integration_connections", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), provider: text("provider").notNull(), displayName: text("display_name").notNull(), status: text("status").notNull().default("not_connected"), externalAccountId: text("external_account_id"), metadataJson: jsonText("metadata_json"), createdAt: now(), updatedAt: updated()
}, (table) => [uniqueIndex("uq_integrations_account_provider_name").on(table.accountId, table.provider, table.displayName)]);

export const syncEvents = sqliteTable("sync_events", {
  id: text("id").primaryKey(), integrationId: text("integration_id").notNull().references(() => integrationConnections.id, { onDelete: "cascade" }), inquiryId: text("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }), status: text("status").notNull(), operation: text("operation").notNull(), externalId: text("external_id"), errorMessage: text("error_message"), createdAt: now()
});

export const notificationRules = sqliteTable("notification_rules", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), userId: text("user_id").references(() => users.id, { onDelete: "cascade" }), ruleKey: text("rule_key").notNull(), label: text("label").notNull(), isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true), conditionsJson: jsonText("conditions_json"), channelsJson: jsonText("channels_json", "[]"), createdAt: now(), updatedAt: updated()
}, (table) => [uniqueIndex("uq_notification_rules").on(table.accountId, table.userId, table.ruleKey)]);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }), actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), action: text("action").notNull(), beforeJson: text("before_json"), afterJson: text("after_json"), createdAt: now()
}, (table) => [index("idx_audit_entity").on(table.entityType, table.entityId, table.createdAt)]);
