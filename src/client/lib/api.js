import ky from "ky";

const GENERATION_TIMEOUT_MS = 120_000;
const INTAKE_TIMEOUT_MS = 120_000;

const api = ky.create({
  prefix: "/api/",
  retry: 0,
  timeout: 30_000,
  hooks: {
    beforeError: [
      async (error) => {
        const response = error.response;
        if (!response) return error;
        try {
          const body = await response.clone().json();
          const message = body?.error || body?.message;
          if (message) error.message = body?.detail ? `${message}: ${body.detail}` : message;
        } catch {}
        return error;
      }
    ]
  }
});

export const client = {
  login: (json) => api.post("auth/login", { json }).json(),
  logout: () => api.post("auth/logout").json(),
  session: () => api.get("auth/session").json(),
  forgotPassword: (json) => api.post("auth/forgot-password", { json }).json(),
  resetPassword: (json) => api.post("auth/reset-password", { json }).json(),
  acceptInvite: (json) => api.post("auth/accept-invite", { json }).json(),
  changePassword: (json) => api.post("security/password", { json }).json(),
  sessions: () => api.get("security/sessions").json(),
  revokeSession: (id) => api.delete(`security/sessions/${id}`).json(),
  adminUsers: () => api.get("admin/users").json(),
  createInvite: (json) => api.post("admin/invites", { json }).json(),
  updateUser: (id, json) => api.patch(`admin/users/${id}`, { json }).json(),
  auditLog: (params = {}) => api.get("admin/audit", { searchParams: cleanParams(params) }).json(),
  providerQueue: (params = {}) => api.get("admin/provider-queue", { searchParams: cleanParams(params) }).json(),
  fileRetention: () => api.get("admin/file-retention").json(),
  saveFileRetention: (json) => api.put("admin/file-retention", { json }).json(),
  runFileRetention: (json = { dryRun: true }) => api.post("admin/file-retention/run", { json }).json(),
  aiPrompts: () => api.get("admin/ai-prompts").json(),
  bootstrap: () => api.get("bootstrap").json(),
  readiness: () => api.get("readiness").json(),
  saveView: (json) => api.post("personalization/saved-views", { json }).json(),
  deleteView: (id) => api.delete(`personalization/saved-views/${id}`).json(),
  today: (date, timezone) => api.get("today", { searchParams: { date, timezone } }).json(),
  notifications: (params = {}) => api.get("notifications", { searchParams: cleanParams(params) }).json(),
  updateNotification: (id, status = "read") => api.patch(`notifications/${id}`, { json: { status } }).json(),
  markAllNotificationsRead: () => api.post("notifications/mark-all-read").json(),
  dismissNotification: (id) => api.delete(`notifications/${id}`).json(),
  inquiries: (params = {}) => api.get("inquiries", { searchParams: cleanParams(params) }).json(),
  inquiry: (id) => api.get(`inquiries/${id}`).json(),
  deleteInquiry: (id) => api.delete(`inquiries/${id}`).json(),
  watchers: (id) => api.get(`inquiries/${id}/watchers`).json(),
  watchInquiry: (id) => api.post(`inquiries/${id}/watchers`).json(),
  unwatchInquiry: (id) => api.delete(`inquiries/${id}/watchers/me`).json(),
  analyze: (json) => api.post("ai/intake-preview", { json }).json(),
  createInquiry: (json) => api.post("inquiries/from-source", { json, timeout: INTAKE_TIMEOUT_MS }).json().catch((error) => {
    if (isTimeoutError(error)) throw friendlyTimeoutError("Inquiry creation is taking longer than expected. Please try again in a moment.");
    throw error;
  }),
  updateStatus: (id, status, expectedUpdatedAt) => api.patch(`inquiries/${id}/status`, { json: cleanPayload({ status, expectedUpdatedAt }) }).json(),
  updateDetails: (id, json) => api.patch(`inquiries/${id}/details`, { json }).json(),
  updateOwner: (id, ownerUserId, expectedUpdatedAt) => api.patch(`inquiries/${id}/owner`, { json: cleanPayload({ ownerUserId, expectedUpdatedAt }) }).json(),
  updateRequirement: (id, status) => api.patch(`missing-requirements/${id}`, { json: { status } }).json(),
  generate: (id, typeOrPayload, tone = "Professional") => {
    const json = typeof typeOrPayload === "object" ? typeOrPayload : { type: typeOrPayload, tone };
    return api.post(`inquiries/${id}/generate`, { json, timeout: GENERATION_TIMEOUT_MS }).json().catch((error) => {
      if (isTimeoutError(error)) throw friendlyTimeoutError("Document generation is taking longer than expected. Please try again in a moment.");
      throw error;
    });
  },
  saveDocument: (id, json) => api.post(`inquiries/${id}/documents`, { json }).json(),
  saveEstimate: (id, json) => api.post(`inquiries/${id}/estimate`, { json }).json(),
  logCommunication: (id, json) => api.post(`inquiries/${id}/communications`, { json }).json(),
  addComment: (id, json) => api.post(`inquiries/${id}/comments`, { json }).json(),
  sendFollowUp: (id, json) => api.post(`inquiries/${id}/send-follow-up`, { json }).json(),
  submitReview: (id, documentId, expectedVersion) => api.post(`inquiries/${id}/proposal-review`, { json: cleanPayload({ documentId, expectedVersion }) }).json(),
  scheduleVisit: (id, json = {}) => api.post(`inquiries/${id}/site-visits`, { json }).json(),
  updateChecklist: (id, status) => api.patch(`checklist-items/${id}`, { json: { status } }).json(),
  saveProfile: (json) => api.patch("profile", { json }).json(),
  saveSettings: (json) => api.put("settings", { json }).json(),
  connectIntegration: (provider) => api.post("integrations", { json: { provider } }).json(),
  sync: (id, provider = "crm") => api.post(`inquiries/${id}/sync`, { json: { provider } }).json(),
  shareFile: (id, json = {}) => api.post(`files/${id}/share-links`, { json }).json(),
  fileShareLinks: (id) => api.get(`files/${id}/share-links`).json(),
  revokeFileShare: (id) => api.delete(`file-share-links/${id}`).json(),
  upload: (id, file, category = "other") => {
    const body = new FormData();
    body.set("file", file);
    body.set("category", category);
    return api.post(`inquiries/${id}/files`, { body }).json();
  },
  deleteFile: (id) => api.delete(`files/${id}`).json()
};

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function cleanPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function isTimeoutError(error) {
  return error?.name === "TimeoutError" || String(error?.message || "").toLowerCase().includes("timed out");
}

function friendlyTimeoutError(message) {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}
