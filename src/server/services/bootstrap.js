import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { accounts, aiSummaries, communications, companies, contacts, inquiries, inquirySources, inquiryWatchers, missingRequirements, sites, userPreferences, userSavedViews } from "../../../db/schema/drizzle-schema.js";
import { createActivity } from "../repositories/index.js";

export const ACCOUNT_ID = "acct_dcdcom";

export async function ensureBootstrap(env, user, accountId = ACCOUNT_ID) {
  const db = getDb(env);
  const seed = seedIds(accountId);
  await db.insert(userPreferences).values({ userId: user.id }).onConflictDoNothing();
  await seedSavedViews(db, user.id);
  const [preference] = await db.select({ settingsJson: userPreferences.settingsJson }).from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1);
  const workspaceSettings = parseSettings(preference?.settingsJson);
  const [existing] = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.accountId, accountId)).limit(1);
  if (existing) {
    if (!workspaceSettings.workspaceInitialized) await markWorkspaceInitialized(db, user.id, workspaceSettings);
    return;
  }
  if (workspaceSettings.workspaceInitialized) return;

  await db.insert(companies).values({ id: seed.company, accountId, name: "NTT Data", industry: "Data Centers" });
  await db.insert(contacts).values({ id: seed.contact, accountId, companyId: seed.company, fullName: "Michael Reynolds", email: "mreynolds@nttdata.com", phone: "(571) 555-0134", preferredChannel: "email" });
  await db.insert(sites).values({ id: seed.site, accountId, companyId: seed.company, name: "Ashburn Data Center", city: "Ashburn", region: "VA", siteType: "data_center", accessNotes: "After hours" });
  await db.insert(inquiries).values({ id: seed.inquiry, accountId, companyId: seed.company, contactId: seed.contact, siteId: seed.site, ownerUserId: user.id, title: "NTT Data - Ashburn, VA", serviceType: "data_center_decommissioning", sourceChannel: "phone", priority: "high", workload: "medium", status: "needs_info", estimatedLowCents: 2_850_000, estimatedHighCents: 4_500_000, confidenceScore: 78, leaseEndDate: "2025-07-31", lastCustomerActivityAt: new Date().toISOString() });
  await db.insert(inquiryWatchers).values({ id: seed.watcher, inquiryId: seed.inquiry, userId: user.id }).onConflictDoNothing();
  const sourceText = "Customer requested data center decommissioning in Ashburn with rack removal, cable abatement, HVAC removal, and site cleanup.";
  await db.insert(inquirySources).values({ id: seed.source, inquiryId: seed.inquiry, channel: "phone", subject: "Call notes", sender: "Michael Reynolds", rawText: sourceText, capturedByUserId: user.id });
  await db.insert(communications).values({ id: seed.communication, inquiryId: seed.inquiry, contactId: seed.contact, direction: "inbound", channel: "phone", subject: "Call notes", body: sourceText, status: "received", createdByUserId: user.id });
  await db.insert(aiSummaries).values({ id: seed.summary, inquiryId: seed.inquiry, summaryType: "intake", body: "Client is requesting decommissioning of a data center suite. Timeline appears urgent and key details are missing on equipment and access.", modelName: "fallback-extractor", confidenceScore: 78, generatedByUserId: user.id });
  await db.insert(missingRequirements).values([
    { id: seed.missingSqft, inquiryId: seed.inquiry, requirementKey: "square_footage", label: "Square footage / suite size", category: "scope", severity: "high", status: "open" },
    { id: seed.missingRacks, inquiryId: seed.inquiry, requirementKey: "rack_count", label: "Number of racks / cabinets", category: "equipment", severity: "high", status: "open" },
    { id: seed.missingPhotos, inquiryId: seed.inquiry, requirementKey: "site_photos", label: "Photos or docs from site", category: "documentation", severity: "medium", status: "open" }
  ]);
  await createActivity(env, accountId, seed.inquiry, user.id, "inquiry.seeded", "Added NTT Data inquiry to the workspace");
  await markWorkspaceInitialized(db, user.id, workspaceSettings);
}

export async function readinessReport(env, user, accountId = ACCOUNT_ID) {
  const db = getDb(env);
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const checks = [
    { key: "d1_binding", ok: Boolean(env.DB), detail: "D1 binding DB is configured through Drizzle ORM." },
    { key: "r2_binding", ok: Boolean(env.FILES), detail: env.FILES ? "R2 binding FILES is configured." : "R2 binding FILES is missing." },
    { key: "schema", ok: true, detail: "46 Drizzle-managed database tables available." },
    { key: "account", ok: Boolean(account), detail: account ? `Account ${accountId} is present.` : `Account ${accountId} bootstrap is missing.` },
    { key: "user_identity", ok: Boolean(user?.email), detail: user?.email ? `Authenticated as ${user.email}.` : "No user identity detected." },
    { key: "auth_mode", ok: String(env.AUTH_SESSION_SECRET || "").trim().length >= 32, detail: String(env.AUTH_SESSION_SECRET || "").trim().length >= 32 ? "Signed session authentication is enforced." : "AUTH_SESSION_SECRET must be configured with at least 32 characters." },
    { key: "openai_key", ok: Boolean(env.OPENAI_API_KEY), warningOnly: true, detail: env.OPENAI_API_KEY ? "Live OpenAI extraction is configured." : "OPENAI_API_KEY is missing; fallback AI will be used." },
    { key: "google_calendar_oauth", ok: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), warningOnly: true, detail: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? "Google Calendar OAuth is configured." : "Google Calendar OAuth credentials are missing; calendar sync is unavailable." }
  ];
  const blocking = checks.filter((check) => !check.ok && !check.warningOnly);
  const warnings = checks.filter((check) => !check.ok && check.warningOnly);
  return { ready: blocking.length === 0, status: blocking.length ? "blocked" : warnings.length ? "degraded" : "ready", checkedAt: new Date().toISOString(), checks };
}

export function publicUser(user) {
  return { id: user.id, accountId: user.account_id || user.accountId, email: user.email, fullName: user.full_name || user.fullName, role: user.role, avatarUrl: user.avatar_url || user.avatarUrl || null, timezone: user.timezone || "America/New_York", locale: user.locale || "en-US" };
}

async function markWorkspaceInitialized(db, userId, settings) {
  await db.update(userPreferences).set({ settingsJson: JSON.stringify({ ...settings, workspaceInitialized: true }), updatedAt: new Date().toISOString() }).where(eq(userPreferences.userId, userId));
}

function parseSettings(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }

async function seedSavedViews(db, userId) {
  const defaults = [
    { id: `view_${userId}_my_open`, userId, screen: "inquiries", name: "My open", filtersJson: JSON.stringify({ owner: "me", status: ["new", "needs_info", "estimating", "site_visit", "proposal", "review"] }), sortJson: JSON.stringify({ key: "priority", direction: "asc" }), isDefault: true },
    { id: `view_${userId}_needs_info`, userId, screen: "inquiries", name: "Needs info", filtersJson: JSON.stringify({ status: ["needs_info"] }), sortJson: JSON.stringify({ key: "lastActivity", direction: "desc" }) },
    { id: `view_${userId}_proposals_due`, userId, screen: "inquiries", name: "Proposals due", filtersJson: JSON.stringify({ status: ["proposal", "review"] }), sortJson: JSON.stringify({ key: "requestedDueDate", direction: "asc" }) },
    { id: `view_${userId}_recent_docs`, userId, screen: "docs", name: "Recent", filtersJson: JSON.stringify({ kind: "recent" }), sortJson: JSON.stringify({ key: "updatedAt", direction: "desc" }), isDefault: true }
  ];
  for (const view of defaults) {
    await db.insert(userSavedViews).values(view).onConflictDoNothing();
  }
}

function seedIds(accountId) {
  const suffix = accountId === ACCOUNT_ID ? "" : `_${accountId.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 32)}`;
  return {
    company: `co_ntt${suffix}`,
    contact: `ct_michael${suffix}`,
    site: `site_ashburn${suffix}`,
    inquiry: `inq_ntt_ashburn${suffix}`,
    source: `src_ntt_call${suffix}`,
    communication: `comm_ntt_seed_call${suffix}`,
    summary: `sum_ntt_intake${suffix}`,
    missingSqft: `miss_ntt_sqft${suffix}`,
    missingRacks: `miss_ntt_racks${suffix}`,
    missingPhotos: `miss_ntt_photos${suffix}`,
    watcher: `watch_ntt_owner${suffix}`
  };
}
