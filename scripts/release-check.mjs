import { readFile } from "node:fs/promises";

const requiredDocs = {
  "docs/incident-runbook.md": ["Severity Levels", "First 15 Minutes", "Recovery"],
  "docs/release-checklist.md": ["Before Staging", "Staging Verification", "Production Promotion", "Post-Launch"]
};

for (const [file, tokens] of Object.entries(requiredDocs)) {
  const body = await readFile(file, "utf8");
  for (const token of tokens) assert(body.includes(token), `${file} should include ${token}`);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
for (const script of ["verify", "readiness", "build", "test:api", "test:mobile-ui", "accessibility:check", "performance:budget"]) {
  assert(packageJson.scripts?.[script], `package.json should define ${script}`);
}

const app = await readFile("src/server/app.js", "utf8");
for (const route of ["/api/readiness", "/api/admin/provider-queue", "/api/admin/file-retention", "/api/admin/ai-prompts"]) {
  assert(app.includes(route), `release gate should cover operational route ${route}`);
}

console.log("Release hardening checks passed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
