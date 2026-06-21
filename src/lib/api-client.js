async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error("API did not return JSON. The local static dev server may be running without the worker API.");
  }
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Request failed with ${response.status}`);
  }
  return body;
}

async function putJson(path, payload) {
  return sendJson("PUT", path, payload);
}

async function patchJson(path, payload) {
  return sendJson("PATCH", path, payload);
}

async function sendJson(method, path, payload) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error("API did not return JSON. The local static dev server may be running without the worker API.");
  }
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Request failed with ${response.status}`);
  }
  return body;
}

async function getJson(path) {
  const response = await fetch(path);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error("API did not return JSON. The local static dev server may be running without the worker API.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
  return body;
}

export function bootstrapWorkspace() {
  return getJson("/api/bootstrap");
}

export function getInquiryDetail(inquiryId) {
  return getJson(`/api/inquiries/${encodeURIComponent(inquiryId)}`);
}

export function saveProfile(payload) {
  return patchJson("/api/profile", payload);
}

export function updateInquiryDetails(inquiryId, payload) {
  return patchJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/details`, payload);
}

export function analyzeIntakePreview(payload) {
  return postJson("/api/ai/intake-preview", payload);
}

export function saveInquiryFromSource(payload) {
  return postJson("/api/inquiries/from-source", payload);
}

export function generateInquiryWorkProduct(inquiryId, payload) {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/generate`, payload);
}

export function saveInquiryDocument(inquiryId, payload) {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/documents`, payload);
}

export function saveInquiryEstimate(inquiryId, payload) {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/estimate`, payload);
}

export function sendFollowUpEmail(inquiryId, payload) {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/send-follow-up`, payload);
}

export function submitProposalReview(inquiryId, payload = {}) {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/proposal-review`, payload);
}

export function listInquiryCommunications(inquiryId) {
  return getJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/communications`);
}

export function logInquiryCommunication(inquiryId, payload) {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/communications`, payload);
}

export function saveSettings(payload) {
  return putJson("/api/settings", payload);
}

export function connectIntegration(provider) {
  return postJson("/api/integrations", { provider });
}

export function syncInquiry(inquiryId, provider = "crm") {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/sync`, { provider });
}

export function updateInquiryStatus(inquiryId, status) {
  return patchJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/status`, { status });
}

export function updateMissingRequirement(requirementId, status) {
  return patchJson(`/api/missing-requirements/${encodeURIComponent(requirementId)}`, { status });
}

export function scheduleInquirySiteVisit(inquiryId, payload = {}) {
  return postJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/site-visits`, payload);
}

export function updateSiteChecklistItem(itemId, payload) {
  return patchJson(`/api/checklist-items/${encodeURIComponent(itemId)}`, payload);
}

export async function uploadInquiryFile(inquiryId, { file, category = "other" }) {
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  const response = await fetch(`/api/inquiries/${encodeURIComponent(inquiryId)}/files`, {
    method: "POST",
    body: form
  });
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error("File API did not return JSON. The local static dev server may be running without the worker API.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Upload failed with ${response.status}`);
  return body;
}

export async function listInquiryFiles(inquiryId) {
  return getJson(`/api/inquiries/${encodeURIComponent(inquiryId)}/files`);
}
