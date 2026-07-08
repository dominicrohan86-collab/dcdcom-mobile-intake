import { z } from "zod";

export const sourceChannel = z.enum(["email", "phone", "text", "manual", "photo", "web"]);
export const inquiryStatus = z.enum(["new", "needs_info", "estimating", "site_visit", "proposal", "review", "won", "lost", "archived"]);
export const requirementStatus = z.enum(["open", "requested", "received", "waived"]);
export const checklistStatus = z.enum(["open", "done", "not_applicable"]);
export const documentType = z.enum(["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate", "closeout", "other"]);
export const integrationProvider = z.enum(["crm", "email", "calendar", "storage", "other"]);
export const notificationStatus = z.enum(["unread", "read", "archived"]);

export const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(1).max(300),
  accountId: z.string().trim().max(80).optional()
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(180),
  password: z.string().min(10).max(300),
  accountId: z.string().trim().max(80).optional()
});

export const emailRequestSchema = z.object({
  email: z.string().trim().email().max(180)
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(12).max(400),
  password: z.string().min(10).max(300)
});

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(12).max(400),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(10).max(300).optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(300),
  newPassword: z.string().min(10).max(300)
});

export const createInviteSchema = z.object({
  email: z.string().trim().email().max(180),
  role: z.enum(["admin", "estimator", "project_manager", "sales"]).default("estimator")
});

export const updateUserAdminSchema = z.object({
  role: z.enum(["admin", "estimator", "project_manager", "sales"]).optional(),
  isActive: z.boolean().optional()
});

export const savedViewSchema = z.object({
  screen: z.enum(["today", "inquiries", "docs", "composers", "admin"]),
  name: z.string().trim().min(1).max(80),
  filters: z.record(z.string(), z.unknown()).default({}),
  sort: z.record(z.string(), z.unknown()).default({}),
  isDefault: z.boolean().default(false)
});

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  entityType: z.string().trim().max(80).optional()
});

export const providerQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().trim().max(40).optional()
});
export const fileRetentionPolicySchema = z.object({
  retentionDays: z.coerce.number().int().min(30).max(3650).default(365),
  archiveAfterDays: z.coerce.number().int().min(1).max(3650).default(180),
  legalHold: z.boolean().default(false)
}).refine((value) => value.archiveAfterDays <= value.retentionDays, "Archive window must be shorter than retention.");
export const fileRetentionRunSchema = z.object({
  dryRun: z.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const intakeSchema = z.object({
  rawText: z.string().trim().min(1).max(40_000),
  sourceChannel: sourceChannel.default("manual"),
  subject: z.string().max(220).optional(),
  sender: z.string().max(180).optional(),
  attachmentText: z.string().max(40_000).optional(),
  externalMessageId: z.string().max(240).nullable().optional()
}).passthrough();

const concurrencySchema = {
  expectedUpdatedAt: z.string().trim().min(1).max(80).optional(),
  expectedVersion: z.coerce.number().int().positive().optional()
};
export const profileSchema = z.object({ fullName: z.string().trim().min(1).max(120), avatarUrl: z.string().url().nullable().optional(), expectedUpdatedAt: concurrencySchema.expectedUpdatedAt });
export const settingsSchema = z.object({
  highPriorityAlerts: z.boolean().default(false),
  leaseDeadlineReminders: z.boolean().default(false),
  dailyDigest: z.boolean().default(false),
  defaultView: z.enum(["today", "pipeline", "docs", "more"]).default("today"),
  timezone: z.string().trim().min(1).max(80).default("America/New_York"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  expectedUpdatedAt: concurrencySchema.expectedUpdatedAt
});
export const integrationSchema = z.object({ provider: integrationProvider });
export const statusSchema = z.object({ status: inquiryStatus, expectedUpdatedAt: concurrencySchema.expectedUpdatedAt });
export const requirementSchema = z.object({ status: requirementStatus });
export const checklistSchema = z.object({ status: checklistStatus, notes: z.string().max(2000).nullable().optional() });
export const detailsSchema = z.object({ contact: z.string().trim().min(1).max(160), email: z.string().email().or(z.literal("")), phone: z.string().max(40).default(""), accessNotes: z.string().max(600).default(""), expectedUpdatedAt: concurrencySchema.expectedUpdatedAt });
export const assignmentSchema = z.object({ ownerUserId: z.string().trim().min(1).max(120).nullable(), expectedUpdatedAt: concurrencySchema.expectedUpdatedAt });
export const generateSchema = z.object({
  type: z.enum(["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate"]),
  tone: z.string().max(40).default("Professional"),
  responseGoal: z.enum(["info_request", "schedule_visit", "proposal_ready"]).optional(),
  sourceDocumentIds: z.array(z.string().max(120)).max(24).optional(),
  additionalContext: z.string().max(4000).default("")
});
export const documentSchema = z.object({ documentId: z.string().nullable().optional(), documentType, title: z.string().max(180).optional(), subject: z.string().max(220).nullable().optional(), body: z.string().min(1).max(40_000), status: z.enum(["draft", "review", "approved", "sent", "archived"]).default("draft"), metadata: z.record(z.string(), z.unknown()).default({}), expectedVersion: concurrencySchema.expectedVersion, expectedUpdatedAt: concurrencySchema.expectedUpdatedAt });
export const communicationSchema = z.object({ direction: z.enum(["inbound", "outbound"]).default("inbound"), channel: z.enum(["email", "phone", "text", "internal_note"]).default("internal_note"), subject: z.string().max(220).optional(), body: z.string().min(1).max(40_000), status: z.enum(["draft", "queued", "sent", "received", "logged", "failed"]).optional(), externalMessageId: z.string().nullable().optional(), occurredAt: z.string().nullable().optional() });
export const commentSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const followUpSchema = z.object({ documentId: z.string().nullable().optional(), title: z.string().max(180).optional(), subject: z.string().max(220).default("Quick follow-up on your data center project"), body: z.string().min(1).max(40_000), channel: z.enum(["email", "text"]).default("email"), metadata: z.record(z.string(), z.unknown()).default({}), expectedVersion: concurrencySchema.expectedVersion, expectedUpdatedAt: concurrencySchema.expectedUpdatedAt });
export const reviewSchema = z.object({ documentId: z.string().nullable().optional(), expectedVersion: concurrencySchema.expectedVersion, expectedUpdatedAt: concurrencySchema.expectedUpdatedAt });
export const estimateSchema = z.object({ lowCents: z.number().positive(), highCents: z.number().positive(), assumptions: z.string().max(4000).nullable().optional(), lineItems: z.array(z.object({ lineType: z.string(), description: z.string(), quantity: z.number().default(1), unit: z.string().default("each"), unitCostCents: z.number().nonnegative() })).max(24).default([]) }).refine((value) => value.highCents >= value.lowCents, "Estimate high value must be at least the low value.");
export const siteVisitSchema = z.object({ scheduledStart: z.string().nullable().optional(), scheduledEnd: z.string().nullable().optional(), notes: z.string().max(4000).nullable().optional(), checklist: z.array(z.string().max(300)).max(20).optional() });
export const syncSchema = z.object({ provider: integrationProvider.default("crm") });
export const activitySchema = z.object({ eventType: z.string().max(100).default("note"), summary: z.string().min(1).max(1000), metadata: z.record(z.string(), z.unknown()).default({}) });
export const notificationQuerySchema = z.object({ includeArchived: z.coerce.boolean().default(false), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const notificationSchema = z.object({ status: notificationStatus.default("read") });
export const fileShareSchema = z.object({ label: z.string().trim().max(120).optional(), expiresAt: z.string().datetime().optional() });
export const inquiryListQuerySchema = z.object({
  status: inquiryStatus.optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});
export const todayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1).max(80).default("America/New_York")
});
