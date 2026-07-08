import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { analyzeIntake, generateWorkProduct } from "../src/server/ai.js";
import * as schema from "../db/drizzle-schema.js";

const serverFiles = [
  "src/server/ai.js", "src/server/api.js", "src/server/app.js", "src/server/auth.js",
  "src/server/bootstrap.js", "src/server/contracts.js", "src/server/db.js", "src/server/index.js",
  "src/server/observability.js",
  "src/server/repository.js", "db/drizzle-schema.js", "scripts/build.mjs", "scripts/dev-server.mjs",
  "scripts/accessibility-check.mjs", "scripts/local-runtime.mjs", "scripts/performance-budget.mjs", "scripts/readiness.mjs", "scripts/release-check.mjs", "scripts/test-api.mjs", "vite.config.js", "drizzle.config.js"
];
for (const file of serverFiles) await run("node", ["--check", file]);

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
for (const dependency of ["react", "@tanstack/react-query", "react-hook-form", "react-dropzone", "zod", "hono", "drizzle-orm", "@radix-ui/react-accordion", "@radix-ui/react-dialog", "@radix-ui/react-popover", "tailwindcss", "lucide-react", "ky"]) {
  assert(packageJson.dependencies[dependency] || packageJson.devDependencies[dependency], `${dependency} should be installed`);
}

const tableNames = Object.values(schema).filter((value) => value?.[Symbol.for("drizzle:IsDrizzleTable")]);
assert(tableNames.length === 42, `Drizzle schema should define 42 tables, found ${tableNames.length}`);

const repository = await readFile("src/server/repository.js", "utf8");
assert(!/env\.DB|\.prepare\(|\bSELECT\s|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b/i.test(repository), "repository should use Drizzle instead of raw D1/SQL");
for (const token of ["getDb", "db.select", "db.insert", "db.update", "deleteInquiry", "env.FILES.delete", "sendOutboundCommunication", "scheduleSiteVisit", "submitProposalForReview"]) assert(repository.includes(token), `repository should include ${token}`);

const app = await readFile("src/server/app.js", "utf8");
for (const token of ["new Hono", "zValidator", "createRequestTelemetry", "loginWithPassword", "signupWithPassword", "/api/auth/login", "/api/auth/signup", "inquiryListQuerySchema", "/api/today", "app.delete(\"/api/inquiries/:id\"", "/api/inquiries/:id/generate", "/api/inquiries/:id/send-follow-up", "/api/inquiries/:id/site-visits"]) assert(app.includes(token), `Hono app should include ${token}`);

const client = await readFile("src/client/App.jsx", "utf8");
for (const token of ["useQuery", "useMutation", "QueryClient", "InquiryDetailScreen", "ProposalScreen", "DocsScreen"]) assert(client.includes(token), `React client should include ${token}`);

const inquiryDetail = await readFile("src/client/screens/InquiryDetail.jsx", "utf8");
for (const token of ["useDropzone", "client.upload", "FileEvidence", "UploadFiles", "AccordionSection"]) assert(inquiryDetail.includes(token), `Inquiry detail should include ${token}`);

for (const removed of ["src/main.js", "src/ui/components.js", "src/ui/screens/today.js", "src/state/app-state.js", "public/app.js", "public/styles.css", "src/server/validation.js", "db/schema.ts"]) {
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
