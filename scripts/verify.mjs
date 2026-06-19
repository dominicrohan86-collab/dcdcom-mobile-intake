import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { analyzeIntake, generateWorkProduct } from "../src/server/ai.js";

const filesToCheck = [
  "src/main.js",
  "src/server/ai.js",
  "src/server/api.js",
  "src/server/auth.js",
  "src/server/db.js",
  "src/server/repository.js",
  "src/server/validation.js",
  "src/ui/action-panel.js",
  "src/ui/screens/add-inquiry.js",
  "src/ui/screens/email.js",
  "src/ui/screens/proposal.js",
  "scripts/build.mjs",
  "scripts/dev-server.mjs",
  "scripts/local-runtime.mjs",
  "scripts/materialize-db.mjs",
  "scripts/readiness.mjs",
  "scripts/test-api.mjs"
];

for (const file of filesToCheck) {
  await run("node", ["--check", file]);
}

const intake = await analyzeIntake({}, {
  sourceChannel: "phone",
  rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full data center decommissioning, cable, HVAC units, proposal, site visit, and roughly 40 racks by July 15."
});

assert(intake.mode === "fallback", "fallback intake mode should be used without OPENAI_API_KEY");
assert(intake.extraction.company.name === "NTT Data", "fallback intake should detect NTT Data");
assert(intake.extraction.service.type === "data_center_decommissioning", "fallback intake should detect service type");

const product = await generateWorkProduct({}, {
  type: "proposal",
  tone: "Professional",
  inquiry: {
    id: "inq_test",
    title: "NTT Data - Ashburn, VA",
    company_name: "NTT Data",
    contact_name: "Tom",
    service_type: "data_center_decommissioning",
    estimated_low_cents: 2500000,
    estimated_high_cents: 4500000,
    confidence_score: 78
  },
  fields: [],
  missing: [{ label: "Floor plan" }, { label: "Access hours" }],
  summaries: [{ body: "Customer needs a data center decommissioning proposal." }],
  documents: []
});

assert(product.mode === "fallback", "fallback work-product mode should be used without OPENAI_API_KEY");
assert(product.product.documentType === "proposal", "work product should preserve requested proposal type");
assert(product.product.sections.length >= 3, "proposal should include sections");

const schema = await readFile("db/schema.sql", "utf8");
for (const token of ["CREATE TABLE IF NOT EXISTS ai_runs", "CREATE TABLE IF NOT EXISTS proposals", "CREATE TABLE IF NOT EXISTS estimate_lines"]) {
  assert(schema.includes(token), `schema should include ${token}`);
}

const hosting = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
assert(hosting.d1 === "DB", "hosting should declare D1 binding DB");
assert(hosting.r2 === "FILES", "hosting should declare R2 binding FILES");

const api = await readFile("src/server/api.js", "utf8");
for (const token of ["/api/files/", "env.FILES.put", "R2 binding FILES"]) {
  assert(api.includes(token), `api should include ${token}`);
}
for (const token of ["requireWriteAccess", "/api/integrations", "/api/settings", "/sync", "/status"]) {
  assert(api.includes(token), `api should include ${token}`);
}
for (const token of ["/api/readiness", "readinessReport", "OPENAI_API_KEY"]) {
  assert(api.includes(token), `api should include ${token}`);
}

const repository = await readFile("src/server/repository.js", "utf8");
for (const token of ["INSERT INTO audit_log", "INSERT INTO sync_events", "UPDATE user_preferences", "integration_connections"]) {
  assert(repository.includes(token), `repository should include ${token}`);
}

console.log("Verification passed.");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
