import ky from "ky";

const api = ky.create({ prefix: "/api/", retry: 0, timeout: 30_000 });

export const client = {
  bootstrap: () => api.get("bootstrap").json(),
  today: (date, timezone) => api.get("today", { searchParams: { date, timezone } }).json(),
  inquiries: (params = {}) => api.get("inquiries", { searchParams: cleanParams(params) }).json(),
  inquiry: (id) => api.get(`inquiries/${id}`).json(),
  deleteInquiry: (id) => api.delete(`inquiries/${id}`).json(),
  analyze: (json) => api.post("ai/intake-preview", { json }).json(),
  createInquiry: (json) => api.post("inquiries/from-source", { json }).json(),
  updateStatus: (id, status) => api.patch(`inquiries/${id}/status`, { json: { status } }).json(),
  updateDetails: (id, json) => api.patch(`inquiries/${id}/details`, { json }).json(),
  updateRequirement: (id, status) => api.patch(`missing-requirements/${id}`, { json: { status } }).json(),
  generate: (id, type, tone = "Professional") => api.post(`inquiries/${id}/generate`, { json: { type, tone } }).json(),
  saveDocument: (id, json) => api.post(`inquiries/${id}/documents`, { json }).json(),
  saveEstimate: (id, json) => api.post(`inquiries/${id}/estimate`, { json }).json(),
  sendFollowUp: (id, json) => api.post(`inquiries/${id}/send-follow-up`, { json }).json(),
  submitReview: (id, documentId) => api.post(`inquiries/${id}/proposal-review`, { json: { documentId } }).json(),
  scheduleVisit: (id, json = {}) => api.post(`inquiries/${id}/site-visits`, { json }).json(),
  updateChecklist: (id, status) => api.patch(`checklist-items/${id}`, { json: { status } }).json(),
  saveProfile: (json) => api.patch("profile", { json }).json(),
  saveSettings: (json) => api.put("settings", { json }).json(),
  connectIntegration: (provider) => api.post("integrations", { json: { provider } }).json(),
  sync: (id, provider = "crm") => api.post(`inquiries/${id}/sync`, { json: { provider } }).json(),
  upload: (id, file, category = "other") => {
    const body = new FormData();
    body.set("file", file);
    body.set("category", category);
    return api.post(`inquiries/${id}/files`, { body }).json();
  }
};

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}
