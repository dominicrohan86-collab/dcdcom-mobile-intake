import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { analyzeIntake, generateWorkProduct } from "../../src/server/ai/index.js";
import * as schema from "../../db/schema/drizzle-schema.js";

const requiredDirectories = [
  "src/client/components", "src/client/screens", "src/client/lib", "src/client/styles",
  "src/server/routes", "src/server/services", "src/server/repositories", "src/server/integrations",
  "src/server/middleware", "src/server/auth", "src/server/ai", "src/server/db",
  "src/shared/contracts", "db/schema", "db/migrations", "infra/cloudflare", "infra/database",
  "scripts/build", "scripts/dev", "scripts/release", "tests/api", "tests/ui", "tests/pwa", "tests/fixtures"
];
for (const directory of requiredDirectories) await access(directory);

const serverFiles = [
  "src/server/ai/index.js", "src/server/api.js", "src/server/routes/app.js", "src/server/auth/index.js",
  "src/server/services/bootstrap.js", "src/shared/contracts/index.js", "src/server/db/client.js", "src/server/index.js",
  "src/server/middleware/observability.js", "src/server/integrations/google-calendar.js",
  "src/server/repositories/index.js", "db/schema/drizzle-schema.js", "scripts/build/build.mjs", "scripts/dev/dev-server.mjs",
  "tests/ui/accessibility-check.mjs", "scripts/dev/local-runtime.mjs", "scripts/release/performance-budget.mjs", "scripts/release/readiness.mjs",
  "scripts/release/release-check.mjs", "tests/api/api.test.mjs", "tests/pwa/pwa.test.mjs", "tests/ui/mobile-ui.test.mjs",
  "src/client/lib/pwa.js", "vite.config.js", "infra/database/drizzle.config.js"
];
for (const file of serverFiles) await run("node", ["--check", file]);
await access("src/client/styles/styles.css");

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
for (const dependency of ["react", "@tanstack/react-query", "react-hook-form", "react-dropzone", "zod", "hono", "drizzle-orm", "@radix-ui/react-accordion", "@radix-ui/react-dialog", "@radix-ui/react-popover", "tailwindcss", "lucide-react", "ky"]) {
  assert(packageJson.dependencies[dependency] || packageJson.devDependencies[dependency], `${dependency} should be installed`);
}

const tableNames = Object.values(schema).filter((value) => value?.[Symbol.for("drizzle:IsDrizzleTable")]);
assert(tableNames.length === 46, `Drizzle schema should define 46 tables, found ${tableNames.length}`);

const repository = await readFile("src/server/repositories/index.js", "utf8");
assert(!/env\.DB|\.prepare\(|\bSELECT\s|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b/i.test(repository), "repository should use Drizzle instead of raw D1/SQL");
for (const token of ["getDb", "db.select", "db.insert", "db.update", "deleteInquiry", "env.FILES.delete", "sendOutboundCommunication", "scheduleSiteVisit", "submitProposalForReview"]) assert(repository.includes(token), `repository should include ${token}`);

const app = await readFile("src/server/routes/app.js", "utf8");
for (const token of ["new Hono", "zValidator", "createRequestTelemetry", "loginWithPassword", "signupWithPassword", "/api/auth/login", "/api/auth/signup", "inquiryListQuerySchema", "/api/today", "app.delete(\"/api/inquiries/:id\"", "/api/inquiries/:id/generate", "/api/inquiries/:id/send-follow-up", "/api/inquiries/:id/site-visits"]) assert(app.includes(token), `Hono app should include ${token}`);

const client = await readFile("src/client/App.jsx", "utf8");
for (const token of ["useQuery", "useMutation", "QueryClient", "InquiryDetailScreen", "ProposalScreen", "DocsScreen"]) assert(client.includes(token), `React client should include ${token}`);

const inquiryDetail = await readFile("src/client/screens/InquiryDetail.jsx", "utf8");
for (const token of ["useDropzone", "client.upload", "FileEvidence", "UploadFiles", "AccordionSection"]) assert(inquiryDetail.includes(token), `Inquiry detail should include ${token}`);

for (const removed of [
  "src/main.js", "src/ui/components.js", "src/ui/screens/today.js", "src/state/app-state.js",
  "public/app.js", "public/styles.css", "src/server/validation.js", "db/schema.ts",
  "src/server/app.js", "src/server/repository.js", "src/server/ai.js", "src/server/auth.js",
  "src/server/bootstrap.js", "src/server/contracts.js", "src/server/db.js", "src/server/google-calendar.js",
  "src/server/observability.js", "src/client/styles.css", "db/drizzle-schema.js", "drizzle.config.js",
  "wrangler.jsonc", "scripts/build.mjs", "scripts/dev-server.mjs", "scripts/local-runtime.mjs",
  "scripts/test-api.mjs", "scripts/test-mobile-ui.mjs", "scripts/test-pwa.mjs",
  "scripts/accessibility-check.mjs", "scripts/verify.mjs", "scripts/readiness.mjs",
  "scripts/release-check.mjs", "scripts/performance-budget.mjs", "example-attachments",
  "docs/stack.md", "docs/database-spec.md", "docs/incident-runbook.md",
  "docs/release-checklist.md", "docs/security-critical-remediation.md", "docs/production-implementation-plan.md"
]) {
  let exists = true;
  try { await access(removed); } catch { exists = false; }
  assert(!exists, `${removed} should be removed after the stack migration`);
}

const intake = await analyzeIntake({}, { sourceChannel: "phone", rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full data center decommissioning, cable, HVAC units, proposal, site visit, and roughly 40 racks by July 15." });
assert(intake.mode === "fallback", "fallback intake should work without an API key");
assert(intake.extraction.company.name === "NTT Data", "fallback intake should detect company");

const product = await generateWorkProduct({}, { type: "proposal", tone: "Professional", inquiry: { id: "inq_test", title: "NTT Data - Ashburn, VA", company_name: "NTT Data", contact_name: "Tom", service_type: "data_center_decommissioning", estimated_low_cents: 2500000, estimated_high_cents: 4500000, confidence_score: 78 }, fields: [], missing: [{ label: "Floor plan" }], summaries: [{ body: "Customer needs a proposal." }], documents: [] });
assert(product.product.documentType === "proposal" && product.product.sections.length >= 3, "proposal fallback should remain complete");

console.log("Stack verification passed: React/Radix UI, Hono/Zod API, and Drizzle repository are active.");

function run(command, args) { return new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: "inherit" }); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))); }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
