import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readinessReport } from "../src/server/bootstrap.js";
import { createLocalEnv } from "./local-runtime.mjs";

const root = await mkdtemp(join(tmpdir(), "dcdcom-readiness-"));

try {
  const env = await createLocalEnv({ root, envRoot: process.cwd() });
  await env.DB.prepare("INSERT INTO accounts (id, name) VALUES (?, ?)").bind("acct_dcdcom", "DC Decom").run();
  const report = await readinessReport(env, { id: "readiness-check", email: "readiness@local.test" });
  const blocking = report.checks.filter((check) => !check.ok && !check.warningOnly);
  const warnings = report.checks.filter((check) => !check.ok && check.warningOnly);
  console.log(JSON.stringify(report, null, 2));
  if (blocking.length) {
    throw new Error(`Readiness failed: ${blocking.map((check) => check.key).join(", ")}`);
  }
  if (warnings.length) {
    console.warn(`Readiness warnings: ${warnings.map((check) => check.key).join(", ")}`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
