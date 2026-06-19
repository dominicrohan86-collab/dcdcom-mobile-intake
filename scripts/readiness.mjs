import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleApi } from "../src/server/api.js";
import { createLocalEnv } from "./local-runtime.mjs";

const root = await mkdtemp(join(tmpdir(), "dcdcom-readiness-"));

try {
  const env = await createLocalEnv({ root });
  const response = await handleApi(
    new Request("http://local.test/api/readiness", {
      headers: { "oai-authenticated-user-email": "alex@dcdcom.com" }
    }),
    env
  );
  const report = await response.json();
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
