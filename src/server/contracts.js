import { z } from "zod";

export const sourceChannel = z.enum(["email", "phone", "text", "manual", "photo", "web"]);
export const inquiryStatus = z.enum(["new", "needs_info", "estimating", "site_visit", "proposal", "review", "won", "lost", "archived"]);
export const requirementStatus = z.enum(["open", "requested", "received", "waived"]);
export const checklistStatus = z.enum(["open", "done", "not_applicable"]);
export const documentType = z.enum(["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate", "closeout", "other"]);
export const integrationProvider = z.enum(["crm", "email", "calendar", "storage", "other"]);

export const intakeSchema = z.object({
  rawText: z.string().trim().min(1).max(40_000),
  sourceChannel: sourceChannel.default("manual"),
  subject: z.string().max(220).optional(),
  sender: z.string().max(180).optional(),
  attachmentText: z.string().max(40_000).optional(),
  externalMessageId: z.string().max(240).nullable().optional()
}).passthrough();

export const profileSchema = z.object({ fullName: z.string().trim().min(1).max(120), avatarUrl: z.string().url().nullable().optional() });
export const settingsSchema = z.object({ highPriorityAlerts: z.boolean().default(false), leaseDeadlineReminders: z.boolean().default(false), dailyDigest: z.boolean().default(false) });
export const integrationSchema = z.object({ provider: integrationProvider });
export const statusSchema = z.object({ status: inquiryStatus });
export const requirementSchema = z.object({ status: requirementStatus });
export const checklistSchema = z.object({ status: checklistStatus, notes: z.string().max(2000).nullable().optional() });
export const detailsSchema = z.object({ contact: z.string().trim().min(1).max(160), email: z.string().email().or(z.literal("")), phone: z.string().max(40).default(""), accessNotes: z.string().max(600).default("") });
export const generateSchema = z.object({ type: z.enum(["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate"]), tone: z.string().max(40).default("Professional") });
export const documentSchema = z.object({ documentId: z.string().nullable().optional(), documentType, title: z.string().max(180).optional(), subject: z.string().max(220).nullable().optional(), body: z.string().min(1).max(40_000), status: z.enum(["draft", "review", "approved", "sent", "archived"]).default("draft"), metadata: z.record(z.string(), z.unknown()).default({}) });
export const communicationSchema = z.object({ direction: z.enum(["inbound", "outbound"]).default("inbound"), channel: z.enum(["email", "phone", "text", "internal_note"]).default("internal_note"), subject: z.string().max(220).optional(), body: z.string().min(1).max(40_000), status: z.enum(["draft", "queued", "sent", "received", "logged", "failed"]).optional(), externalMessageId: z.string().nullable().optional(), occurredAt: z.string().nullable().optional() });
export const followUpSchema = z.object({ documentId: z.string().nullable().optional(), title: z.string().max(180).optional(), subject: z.string().max(220).default("Quick follow-up on your data center project"), body: z.string().min(1).max(40_000), channel: z.enum(["email", "text"]).default("email"), metadata: z.record(z.string(), z.unknown()).default({}) });
export const reviewSchema = z.object({ documentId: z.string().nullable().optional() });
export const estimateSchema = z.object({ lowCents: z.number().positive(), highCents: z.number().positive(), assumptions: z.string().max(4000).nullable().optional(), lineItems: z.array(z.object({ lineType: z.string(), description: z.string(), quantity: z.number().default(1), unit: z.string().default("each"), unitCostCents: z.number().nonnegative() })).max(24).default([]) }).refine((value) => value.highCents >= value.lowCents, "Estimate high value must be at least the low value.");
export const siteVisitSchema = z.object({ scheduledStart: z.string().nullable().optional(), scheduledEnd: z.string().nullable().optional(), notes: z.string().max(4000).nullable().optional(), checklist: z.array(z.string().max(300)).max(20).optional() });
export const syncSchema = z.object({ provider: integrationProvider.default("crm") });
export const activitySchema = z.object({ eventType: z.string().max(100).default("note"), summary: z.string().min(1).max(1000), metadata: z.record(z.string(), z.unknown()).default({}) });
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
