import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleApi } from "../src/server/api.js";
import { createLocalEnv } from "./local-runtime.mjs";

const root = await mkdtemp(join(tmpdir(), "dcdcom-api-"));

try {
  const env = await createLocalEnv({ root });
  const health = await request(env, "GET", "/api/health");
  assert(health.status === 200, "health should return 200");
  assert(health.body.fileStorage === "R2", "health should expose local R2");
  assert(health.headers.get("x-content-type-options") === "nosniff", "JSON responses should include security headers");

  const readiness = await request(env, "GET", "/api/readiness");
  assert(readiness.status === 200, "readiness should return 200");
  assert(readiness.body.ready === true, "readiness should not have blocking failures in local env");
  assert(readiness.body.status === "degraded", "readiness should warn about missing OpenAI key in local env");

  const boot = await request(env, "GET", "/api/bootstrap");
  assert(boot.status === 200, "bootstrap should return 200");
  assert(boot.body.inquiries.length === 1, "bootstrap should seed one demo inquiry in fresh local env");

  const preview = await request(env, "POST", "/api/ai/intake-preview", {
    rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full decommissioning, 40 racks, cable, HVAC units, proposal, and site visit by July 15.",
    sourceChannel: "phone"
  });
  assert(preview.status === 200, "intake preview should return 200");
  assert(preview.body.extraction.company.name === "NTT Data", "intake preview should extract company");

  const saved = await request(env, "POST", "/api/inquiries/from-source", {
    rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full decommissioning, 40 racks, cable, HVAC units, proposal, and site visit by July 15.",
    sourceChannel: "phone"
  });
  assert(saved.status === 201, "source intake should create inquiry");
  assert(saved.body.id, "source intake should return inquiry id");

  const proposal = await request(env, "POST", `/api/inquiries/${saved.body.id}/generate`, {
    type: "proposal",
    tone: "Professional"
  });
  assert(proposal.status === 201, "proposal generation should persist");
  assert(proposal.body.documentId, "proposal generation should return document id");

  const detailAfterProposal = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(detailAfterProposal.status === 200, "detail after proposal should return 200");
  const persistedProposal = detailAfterProposal.body.documents.find((document) => document.document_type === "proposal");
  assert(persistedProposal, "detail should include generated proposal document");
  assert(persistedProposal.body && persistedProposal.body.includes("Scope"), "proposal detail should include latest document body");
  assert(persistedProposal.metadata_json, "proposal detail should include document metadata");

  const emailDraftV1 = await request(env, "POST", `/api/inquiries/${saved.body.id}/documents`, {
    documentType: "follow_up_email",
    title: "Follow-up Email - NTT Data",
    subject: "Quick follow-up on your data center project",
    body: "Edited follow-up v1",
    metadata: {
      confidenceScore: 78,
      approvalRequired: false,
      missingRiskNotes: ["Need access hours"],
      nextActions: ["Review/send follow-up email"]
    }
  });
  assert(emailDraftV1.status === 201, "manual email draft should save");
  assert(emailDraftV1.body.document.currentVersion === 1, "first manual draft should create version 1");
  assert(emailDraftV1.body.document.documentId, "manual draft should return document id");

  const emailDraftV2 = await request(env, "POST", `/api/inquiries/${saved.body.id}/documents`, {
    documentId: emailDraftV1.body.document.documentId,
    documentType: "follow_up_email",
    title: "Follow-up Email - NTT Data",
    subject: "Quick follow-up on your data center project",
    body: "Edited follow-up v2",
    metadata: {
      confidenceScore: 82,
      approvalRequired: false,
      missingRiskNotes: ["Need access hours"],
      nextActions: ["Review/send follow-up email"]
    }
  });
  assert(emailDraftV2.status === 201, "manual email draft update should save");
  assert(emailDraftV2.body.document.currentVersion === 2, "second manual draft should create version 2");

  const detailAfterEmail = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  const persistedEmail = detailAfterEmail.body.documents.find((document) => document.document_type === "follow_up_email");
  assert(persistedEmail, "detail should include saved follow-up email");
  assert(persistedEmail.body === "Edited follow-up v2", "detail should expose latest edited email body");
  assert(persistedEmail.generated_by_ai === 0, "manual email version should not be marked AI-generated");

  const form = new FormData();
  form.append("category", "floor_plan");
  form.append("file", new File(["floor plan placeholder"], "floor-plan.txt", { type: "text/plain" }));
  const upload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, form);
  assert(upload.status === 201, "file upload should persist");
  assert(upload.body.file.id, "file upload should return file id");

  const files = await request(env, "GET", `/api/inquiries/${saved.body.id}/files`);
  assert(files.status === 200, "file listing should return 200");
  assert(files.body.files.length === 1, "file listing should include uploaded file");

  const download = await rawRequest(env, "GET", `/api/files/${upload.body.file.id}`);
  assert(download.status === 200, "file download should return 200");
  assert(await download.text() === "floor plan placeholder", "file download should return uploaded bytes");

  const settings = await request(env, "PUT", "/api/settings", {
    highPriorityAlerts: true,
    leaseDeadlineReminders: true,
    dailyDigest: true
  });
  assert(settings.status === 200, "settings save should return 200");
  assert(settings.body.preferences.notification_digest === "daily", "settings should persist digest");

  const integration = await request(env, "POST", "/api/integrations", { provider: "crm" });
  assert(integration.status === 201, "integration connect should return 201");
  assert(integration.body.integration.status === "connected", "integration should be connected");

  const sync = await request(env, "POST", `/api/inquiries/${saved.body.id}/sync`, { provider: "crm" });
  assert(sync.status === 201, "sync should return 201");
  assert(sync.body.sync.status === "success", "sync should persist success");

  const status = await request(env, "PATCH", `/api/inquiries/${saved.body.id}/status`, { status: "review" });
  assert(status.status === 200, "status update should return 200");
  assert(status.body.inquiry.status === "review", "status update should persist review");

  console.log("API smoke tests passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}

async function request(env, method, path, payload) {
  const response = await rawRequest(env, method, path, payload);
  const body = await response.json();
  return { status: response.status, body, headers: response.headers };
}

async function rawRequest(env, method, path, payload) {
  const init = { method, headers: new Headers({ "oai-authenticated-user-email": "alex@dcdcom.com" }) };
  if (payload instanceof FormData) {
    init.body = payload;
  } else if (payload !== undefined) {
    init.headers.set("content-type", "application/json");
    init.body = JSON.stringify(payload);
  }
  return handleApi(new Request(`http://local.test${path}`, init), env);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
