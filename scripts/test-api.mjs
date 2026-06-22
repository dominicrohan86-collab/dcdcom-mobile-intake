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

  const todayDate = dateKey(new Date(), "America/New_York");
  const today = await request(env, "GET", `/api/today?date=${todayDate}&timezone=America%2FNew_York`);
  assert(today.status === 200, "today agenda should return 200");
  assert(today.body.date === todayDate, "today agenda should preserve the selected date");
  assert(today.body.actions.some((action) => action.type === "follow_up" && action.screen === "email"), "today agenda should expose a working follow-up action");
  assert(today.body.events.some((event) => event.kind === "follow_up" && event.startMinutes === 540), "today agenda should schedule actionable workflow work");
  const invalidToday = await request(env, "GET", "/api/today?date=not-a-date&timezone=America%2FNew_York");
  assert(invalidToday.status === 400, "today agenda should reject invalid dates");

  const profile = await request(env, "PATCH", "/api/profile", { fullName: "Alex Production" });
  assert(profile.status === 200, "profile update should return 200");
  assert(profile.body.user.fullName === "Alex Production", "profile update should persist full name");

  const preview = await request(env, "POST", "/api/ai/intake-preview", {
    rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full decommissioning, 40 racks, cable, HVAC units, proposal, and site visit by July 15.",
    sourceChannel: "phone"
  });
  assert(preview.status === 200, "intake preview should return 200");
  assert(preview.body.extraction.company.name === "NTT Data", "intake preview should extract company");

  const saved = await request(env, "POST", "/api/inquiries/from-source", {
    rawText: "Spoke with Tom from NTT Data in Ashburn, VA. Need full decommissioning, 40 racks, cable, HVAC units, proposal, and site visit by July 15.",
    sourceChannel: "phone",
    externalMessageId: "call_001"
  });
  assert(saved.status === 201, "source intake should create inquiry");
  assert(saved.body.id, "source intake should return inquiry id");

  const inboundWebhook = await request(env, "POST", "/api/intake/inbound", {
    rawText: "Email from Priya at Cushman in Washington DC. Need cable abatement estimate before lease restoration. Missing ceiling height and cable volume.",
    sourceChannel: "email",
    sender: "priya.shah@cw.example",
    subject: "Cable removal request",
    externalMessageId: "email_001"
  });
  assert(inboundWebhook.status === 202, "inbound intake endpoint should accept external messages");
  assert(inboundWebhook.body.accepted === true, "inbound intake endpoint should mark payload accepted");

  const proposal = await request(env, "POST", `/api/inquiries/${saved.body.id}/generate`, {
    type: "proposal",
    tone: "Professional"
  });
  assert(proposal.status === 201, "proposal generation should persist");
  assert(proposal.body.documentId, "proposal generation should return document id");

  const detailAfterProposal = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(detailAfterProposal.status === 200, "detail after proposal should return 200");
  assert(detailAfterProposal.body.communications.some((communication) => communication.direction === "inbound"), "detail should include inbound source communication");
  const persistedProposal = detailAfterProposal.body.documents.find((document) => document.document_type === "proposal");
  assert(persistedProposal, "detail should include generated proposal document");
  assert(persistedProposal.body && persistedProposal.body.includes("Scope"), "proposal detail should include latest document body");
  assert(persistedProposal.metadata_json, "proposal detail should include document metadata");

  const editedProposal = await request(env, "POST", `/api/inquiries/${saved.body.id}/documents`, {
    documentId: proposal.body.documentId,
    documentType: "proposal",
    title: "Edited Proposal - NTT Data",
    body: "Scope\nEdited proposal body for customer review.\n\nTerms\nEdited terms.",
    metadata: {
      confidenceScore: 80,
      approvalRequired: true,
      missingRiskNotes: ["Need access hours"],
      nextActions: ["Review proposal edits"]
    }
  });
  assert(editedProposal.status === 201, "proposal edits should save as document version");
  assert(editedProposal.body.document.currentVersion === 2, "proposal edit should increment document version");
  assert(editedProposal.body.document.body.includes("Edited proposal body"), "proposal edit should return saved body");

  const reviewSubmission = await request(env, "POST", `/api/inquiries/${saved.body.id}/proposal-review`, {
    documentId: editedProposal.body.document.documentId
  });
  assert(reviewSubmission.status === 200, "proposal review submission should return 200");
  assert(reviewSubmission.body.document.status === "review", "proposal document should be marked review");
  assert(reviewSubmission.body.document.body.includes("Edited proposal body"), "proposal review should submit the edited proposal body");
  assert(reviewSubmission.body.proposal.status === "review", "proposal row should be marked review");
  assert(reviewSubmission.body.inquiry.status === "review", "inquiry should move to review");

  const badEstimate = await request(env, "POST", `/api/inquiries/${saved.body.id}/estimate`, {
    lowCents: 4500000,
    highCents: 2500000
  });
  assert(badEstimate.status === 400, "invalid estimate range should return 400");

  const savedEstimate = await request(env, "POST", `/api/inquiries/${saved.body.id}/estimate`, {
    lowCents: 2850000,
    highCents: 4500000,
    assumptions: "Approved from mobile estimate builder after rack count confirmation.",
    lineItems: [
      { lineType: "labor", description: "Labor", quantity: 1, unit: "each", unitCostCents: 1200000 },
      { lineType: "logistics", description: "Logistics", quantity: 1, unit: "each", unitCostCents: 550000 },
      { lineType: "recycling", description: "Recycling", quantity: 1, unit: "each", unitCostCents: 420000 },
      { lineType: "contingency", description: "Contingency", quantity: 1, unit: "each", unitCostCents: 280000 }
    ]
  });
  assert(savedEstimate.status === 201, "estimate save should create approved estimate");
  assert(savedEstimate.body.estimate.status === "approved", "estimate save should approve estimate");
  assert(savedEstimate.body.lineItems.length === 4, "estimate save should persist line items");
  assert(savedEstimate.body.inquiry.status === "estimating", "estimate save should move inquiry to estimating");
  assert(savedEstimate.body.inquiry.estimated_low_cents === 2850000, "estimate save should update low range");

  const detailsUpdate = await request(env, "PATCH", `/api/inquiries/${saved.body.id}/details`, {
    contact: "Tom Rivera",
    email: "tom.rivera@nttdata.example",
    phone: "(571) 555-0190",
    accessNotes: "Security escort required"
  });
  assert(detailsUpdate.status === 200, "detail update should return 200");
  assert(detailsUpdate.body.details.full_name === "Tom Rivera", "detail update should persist contact name");

  const detailAfterDetails = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(detailAfterDetails.body.inquiry.contact_name === "Tom Rivera", "detail readback should include updated contact");
  assert(detailAfterDetails.body.inquiry.access_notes === "Security escort required", "detail readback should include updated access notes");
  assert(detailAfterDetails.body.fields.some((field) => field.field_key === "access_requirements" && field.value_text === "Security escort required"), "detail update should refresh extracted field");

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

  const sentFollowUp = await request(env, "POST", `/api/inquiries/${saved.body.id}/send-follow-up`, {
    documentId: emailDraftV2.body.document.documentId,
    subject: "Quick follow-up on your data center project",
    body: "Could you send the floor plan, access hours, and utility shutoff requirements?",
    channel: "email"
  });
  assert(sentFollowUp.status === 202, "follow-up send should queue without provider webhook");
  assert(sentFollowUp.body.communication.status === "queued", "follow-up communication should be queued");
  assert(sentFollowUp.body.delivery.status === "queued", "delivery attempt should be queued");
  assert(sentFollowUp.body.document.currentVersion === 3, "queued follow-up should save a new document version");

  const communications = await request(env, "GET", `/api/inquiries/${saved.body.id}/communications`);
  assert(communications.status === 200, "communications listing should return 200");
  assert(communications.body.communications.some((communication) => communication.direction === "outbound" && communication.status === "queued"), "communications listing should include queued outbound follow-up");

  const detailBeforeMissing = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  const missingRequirement = detailBeforeMissing.body.missing[0];
  assert(missingRequirement?.id, "detail should expose missing requirement ids");
  const requestedMissing = await request(env, "PATCH", `/api/missing-requirements/${missingRequirement.id}`, { status: "requested" });
  assert(requestedMissing.status === 200, "missing requirement request should persist");
  assert(requestedMissing.body.requirement.status === "requested", "missing requirement should move to requested");
  const receivedMissing = await request(env, "PATCH", `/api/missing-requirements/${missingRequirement.id}`, { status: "received" });
  assert(receivedMissing.status === 200, "missing requirement receipt should persist");
  assert(receivedMissing.body.requirement.status === "received", "missing requirement should move to received");

  const siteVisit = await request(env, "POST", `/api/inquiries/${saved.body.id}/site-visits`, {
    checklist: ["Confirm access", "Photograph racks", "Validate disconnect scope"]
  });
  assert(siteVisit.status === 201, "site visit schedule should persist");
  assert(siteVisit.body.siteVisit.status === "scheduled", "site visit should be scheduled");
  assert(siteVisit.body.siteVisit.checklistItems.length >= 3, "site visit should include checklist items");
  assert(siteVisit.body.calendarSync.status === "queued", "site visit should queue a calendar hold");

  const checklistItem = siteVisit.body.siteVisit.checklistItems[0];
  const checklistUpdate = await request(env, "PATCH", `/api/checklist-items/${checklistItem.id}`, { status: "done" });
  assert(checklistUpdate.status === 200, "checklist item update should persist");
  assert(checklistUpdate.body.checklistItem.status === "done", "checklist item should move to done");

  const siteVisits = await request(env, "GET", `/api/inquiries/${saved.body.id}/site-visits`);
  assert(siteVisits.status === 200, "site visits listing should return 200");
  assert(siteVisits.body.siteVisits.some((visit) => visit.checklistItems.some((item) => item.status === "done")), "site visits listing should expose updated checklist state");

  const visitDate = dateKey(new Date(siteVisit.body.siteVisit.scheduled_start), "America/New_York");
  const visitAgenda = await request(env, "GET", `/api/today?date=${visitDate}&timezone=America%2FNew_York`);
  assert(visitAgenda.status === 200, "scheduled visit agenda should return 200");
  assert(visitAgenda.body.events.some((event) => event.visitId === siteVisit.body.siteVisit.id && event.source === "calendar"), "today agenda should expose persisted site visits");

  const form = new FormData();
  form.append("category", "floor_plan");
  form.append("file", new File(["floor plan placeholder"], "floor-plan.txt", { type: "text/plain" }));
  const upload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, form);
  assert(upload.status === 201, "file upload should persist");
  assert(upload.body.file.id, "file upload should return file id");

  const files = await request(env, "GET", `/api/inquiries/${saved.body.id}/files`);
  assert(files.status === 200, "file listing should return 200");
  assert(files.body.files.length === 1, "file listing should include uploaded file");

  const photoForm = new FormData();
  photoForm.append("category", "photo");
  photoForm.append("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "site-photo.png", { type: "image/png" }));
  const photoUpload = await request(env, "POST", `/api/inquiries/${saved.body.id}/files`, photoForm);
  assert(photoUpload.status === 201, "photo upload should persist");
  assert(photoUpload.body.file.category === "photo", "photo upload should preserve its category");
  const filesAfterPhoto = await request(env, "GET", `/api/inquiries/${saved.body.id}/files`);
  assert(filesAfterPhoto.body.files.some((file) => file.file_name === "site-photo.png" && file.content_type === "image/png"), "file listing should expose uploaded site photos");

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

  const storedDocumentKey = files.body.files[0].storage_key;
  const storedPhoto = filesAfterPhoto.body.files.find((file) => file.file_name === "site-photo.png");
  const deletedInquiry = await request(env, "DELETE", `/api/inquiries/${saved.body.id}`);
  assert(deletedInquiry.status === 200, "inquiry deletion should return 200");
  assert(deletedInquiry.body.deleted === true, "inquiry deletion should confirm deletion");
  assert(deletedInquiry.body.inquiry.deletedFiles === 2, "inquiry deletion should report removed stored files");
  assert(await env.FILES.get(storedDocumentKey) === null, "inquiry deletion should remove document objects from storage");
  assert(await env.FILES.get(storedPhoto.storage_key) === null, "inquiry deletion should remove photo objects from storage");
  const deletedDetail = await request(env, "GET", `/api/inquiries/${saved.body.id}`);
  assert(deletedDetail.status === 404, "deleted inquiry should no longer be readable");
  const deletedFile = await rawRequest(env, "GET", `/api/files/${upload.body.file.id}`);
  assert(deletedFile.status === 404, "deleted inquiry files should no longer be downloadable");
  for (const table of ["inquiry_sources", "extracted_fields", "missing_requirements", "ai_summaries", "ai_runs", "estimates", "site_visits", "documents", "proposals", "communications", "files", "activity_events", "sync_events"]) {
    assert(await countRows(env, table, "inquiry_id", saved.body.id) === 0, `${table} should not retain deleted inquiry records`);
  }
  assert(await countRows(env, "audit_log", "entity_id", saved.body.id) === 0, "audit log should not retain deleted inquiry entries");
  const duplicateDelete = await request(env, "DELETE", `/api/inquiries/${saved.body.id}`);
  assert(duplicateDelete.status === 404, "deleting a missing inquiry should return 404");

  const remainingInquiries = await request(env, "GET", "/api/inquiries");
  for (const inquiry of remainingInquiries.body.inquiries) {
    const cleanup = await request(env, "DELETE", `/api/inquiries/${inquiry.id}`);
    assert(cleanup.status === 200, "test workspace cleanup should delete each remaining inquiry");
  }
  const emptyWorkspace = await request(env, "GET", "/api/bootstrap");
  assert(emptyWorkspace.body.inquiries.length === 0, "an intentionally emptied workspace should not reseed demo inquiries");

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

function dateKey(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function countRows(env, table, column, value) {
  const allowedTables = new Set(["inquiry_sources", "extracted_fields", "missing_requirements", "ai_summaries", "ai_runs", "estimates", "site_visits", "documents", "proposals", "communications", "files", "activity_events", "sync_events", "audit_log"]);
  if (!allowedTables.has(table) || !["inquiry_id", "entity_id"].includes(column)) throw new Error("Unsupported deletion verification query");
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).bind(value).first();
  return Number(row?.count || 0);
}
