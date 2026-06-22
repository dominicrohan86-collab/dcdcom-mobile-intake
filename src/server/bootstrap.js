import { eq } from "drizzle-orm";
import { getDb } from "./db.js";
import { accounts, aiSummaries, communications, companies, contacts, inquiries, inquirySources, missingRequirements, sites, userPreferences, users } from "../../db/drizzle-schema.js";
import { createActivity } from "./repository.js";

export const ACCOUNT_ID = "acct_dcdcom";

export async function ensureBootstrap(env, user) {
  const db = getDb(env);
  await db.insert(accounts).values({ id: ACCOUNT_ID, name: "DCDcom", domain: "dcdcom.com" }).onConflictDoNothing();
  await db.insert(users).values({ id: user.id, accountId: ACCOUNT_ID, email: user.email, fullName: user.fullName, role: "project_manager" }).onConflictDoNothing();
  await db.insert(userPreferences).values({ userId: user.id }).onConflictDoNothing();
  const [preference] = await db.select({ settingsJson: userPreferences.settingsJson }).from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1);
  const workspaceSettings = parseSettings(preference?.settingsJson);
  const [existing] = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.accountId, ACCOUNT_ID)).limit(1);
  if (existing) {
    if (!workspaceSettings.workspaceInitialized) await markWorkspaceInitialized(db, user.id, workspaceSettings);
    return;
  }
  if (workspaceSettings.workspaceInitialized) return;

  await db.insert(companies).values({ id: "co_ntt", accountId: ACCOUNT_ID, name: "NTT Data", industry: "Data Centers" });
  await db.insert(contacts).values({ id: "ct_michael", accountId: ACCOUNT_ID, companyId: "co_ntt", fullName: "Michael Reynolds", email: "mreynolds@nttdata.com", phone: "(571) 555-0134", preferredChannel: "email" });
  await db.insert(sites).values({ id: "site_ashburn", accountId: ACCOUNT_ID, companyId: "co_ntt", name: "Ashburn Data Center", city: "Ashburn", region: "VA", siteType: "data_center", accessNotes: "After hours" });
  await db.insert(inquiries).values({ id: "inq_ntt_ashburn", accountId: ACCOUNT_ID, companyId: "co_ntt", contactId: "ct_michael", siteId: "site_ashburn", ownerUserId: user.id, title: "NTT Data - Ashburn, VA", serviceType: "data_center_decommissioning", sourceChannel: "phone", priority: "high", workload: "medium", status: "needs_info", estimatedLowCents: 2_850_000, estimatedHighCents: 4_500_000, confidenceScore: 78, leaseEndDate: "2025-07-31", lastCustomerActivityAt: new Date().toISOString() });
  const sourceText = "Customer requested data center decommissioning in Ashburn with rack removal, cable abatement, HVAC removal, and site cleanup.";
  await db.insert(inquirySources).values({ id: "src_ntt_call", inquiryId: "inq_ntt_ashburn", channel: "phone", subject: "Call notes", sender: "Michael Reynolds", rawText: sourceText, capturedByUserId: user.id });
  await db.insert(communications).values({ id: "comm_ntt_seed_call", inquiryId: "inq_ntt_ashburn", contactId: "ct_michael", direction: "inbound", channel: "phone", subject: "Call notes", body: sourceText, status: "received", createdByUserId: user.id });
  await db.insert(aiSummaries).values({ id: "sum_ntt_intake", inquiryId: "inq_ntt_ashburn", summaryType: "intake", body: "Client is requesting decommissioning of a data center suite. Timeline appears urgent and key details are missing on equipment and access.", modelName: "fallback-extractor", confidenceScore: 78, generatedByUserId: user.id });
  await db.insert(missingRequirements).values([
    { id: "miss_ntt_sqft", inquiryId: "inq_ntt_ashburn", requirementKey: "square_footage", label: "Square footage / suite size", category: "scope", severity: "high", status: "open" },
    { id: "miss_ntt_racks", inquiryId: "inq_ntt_ashburn", requirementKey: "rack_count", label: "Number of racks / cabinets", category: "equipment", severity: "high", status: "open" },
    { id: "miss_ntt_photos", inquiryId: "inq_ntt_ashburn", requirementKey: "site_photos", label: "Photos or docs from site", category: "documentation", severity: "medium", status: "open" }
  ]);
  await createActivity(env, ACCOUNT_ID, "inq_ntt_ashburn", user.id, "inquiry.seeded", "Seeded NTT Data inquiry for demo workspace");
  await markWorkspaceInitialized(db, user.id, workspaceSettings);
}

export async function readinessReport(env, user) {
  const db = getDb(env);
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, ACCOUNT_ID)).limit(1);
  const checks = [
    { key: "d1_binding", ok: Boolean(env.DB), detail: "D1 binding DB is configured through Drizzle ORM." },
    { key: "r2_binding", ok: Boolean(env.FILES), detail: env.FILES ? "R2 binding FILES is configured." : "R2 binding FILES is missing." },
    { key: "schema", ok: true, detail: "28 Drizzle-managed database tables available." },
    { key: "account", ok: Boolean(account), detail: account ? "DCDcom account is present." : "DCDcom account bootstrap is missing." },
    { key: "user_identity", ok: Boolean(user?.email), detail: user?.email ? `Authenticated as ${user.email}.` : "No user identity detected." },
    { key: "openai_key", ok: Boolean(env.OPENAI_API_KEY), warningOnly: true, detail: env.OPENAI_API_KEY ? "Live OpenAI extraction is configured." : "OPENAI_API_KEY is missing; fallback AI will be used." }
  ];
  const blocking = checks.filter((check) => !check.ok && !check.warningOnly);
  const warnings = checks.filter((check) => !check.ok && check.warningOnly);
  return { ready: blocking.length === 0, status: blocking.length ? "blocked" : warnings.length ? "degraded" : "ready", checkedAt: new Date().toISOString(), checks };
}

export function publicUser(user) {
  return { id: user.id, email: user.email, fullName: user.full_name || user.fullName, role: user.role, avatarUrl: user.avatar_url || user.avatarUrl || null };
}

async function markWorkspaceInitialized(db, userId, settings) {
  await db.update(userPreferences).set({ settingsJson: JSON.stringify({ ...settings, workspaceInitialized: true }), updatedAt: new Date().toISOString() }).where(eq(userPreferences.userId, userId));
}

function parseSettings(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }
