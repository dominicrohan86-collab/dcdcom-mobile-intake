import { icon } from "../../lib/icons.js";
import { badge, shell } from "../components.js";

export function detailScreen({ state, selected }) {
  const item = selected();
  const missingItems = item.missingItems || item.missingFull.map((label, index) => ({ id: `local_missing_${index}`, label, status: "open", severity: "medium" }));
  const missingRows = missingItems.map((m) => `
    <li class="${["received", "waived"].includes(m.status) ? "done" : "todo"} missing-row">
      <span></span>
      <b>${escapeHtml(m.label)}</b>
      <em>${escapeHtml(m.status)}</em>
      ${m.id.startsWith("local_") ? "" : `<div class="missing-actions">
        ${m.status === "open" ? `<button data-action="missing-requested" data-requirement-id="${m.id}">Request</button>` : ""}
        ${m.status !== "received" ? `<button data-action="missing-received" data-requirement-id="${m.id}">Received</button>` : ""}
        ${m.status !== "waived" ? `<button data-action="missing-waived" data-requirement-id="${m.id}">Waive</button>` : ""}
      </div>`}
    </li>
  `).join("");
  const capturedRows = item.captured.map(([k, v]) => `<li class="done"><span></span><b>${k}</b><em>${v}</em></li>`).join("");
  const files = state.uploadedFiles[item.id] || [];
  const communications = state.communications[item.id] || [];
  const lease = item.captured.find(([key]) => key.toLowerCase().includes("lease"))?.[1] || "Missing";
  const totalInfo = missingItems.length + item.captured.length;
  const summary = state.expandedSummary
    ? `${item.summary} Recommended next step: confirm ${item.missingFull.slice(0, 3).join(", ").toLowerCase()} before committing labor or recycling assumptions.`
    : item.summary;

  return shell(`
    <section class="detail-head">
      <h2>${item.title}</h2>
      ${badge(item.service, "blue")}
      <div class="meta-line"><span>${icon("pin")} ${item.location}</span><span>${icon("calendar")} Lease End: ${lease}</span></div>
      <div class="badge-row">${badge(`${item.workload} Workload`, item.workload)}${badge(`${item.priority} Priority`, item.priority)}</div>
    </section>
    <section class="summary-card">
      <div class="card-title"><h3>${icon("spark")} AI Summary</h3><span>Generated 2h ago</span></div>
      <p>${summary}</p>
      <button data-action="expand-summary">${state.expandedSummary ? "Show less⌃" : "Show more⌄"}</button>
    </section>
    <section class="detail-section">
      <div class="section-head tight"><h3>Missing Information</h3><span class="count-pill">${item.missingCount ?? item.missingFull.length} of ${totalInfo || item.missingFull.length}</span></div>
      <ul class="check-list">${missingRows}${capturedRows}</ul>
    </section>
    <section class="detail-section">
      <div class="section-head tight"><h3>Extracted Details</h3><button data-action="edit-details">Edit</button></div>
      <div class="detail-table">
        <div><b>Contact</b><span>${item.contact}</span></div>
        <div><b>Company</b><span>${item.company}</span></div>
        <div><b>Email</b><a href="mailto:${item.email}">${item.email}</a></div>
        <div><b>Phone</b><a href="tel:${item.phone.replace(/\D/g, "")}">${item.phone}</a></div>
      </div>
    </section>
    <section class="detail-section">
      <div class="section-head tight"><h3>Files & Site Evidence</h3><button data-screen="add" data-tab-target="Photo">Add</button></div>
      ${files.length ? `<div class="attachment-list">${files.map((file) => `<a href="${file.url || "#"}" target="_blank" rel="noreferrer">${icon(file.category === "photo" ? "camera" : "file")}<span>${file.fileName}</span><em>${formatBytes(file.sizeBytes)}</em></a>`).join("")}</div>` : `<p class="empty-note">No photos, floor plans, or equipment files attached yet.</p>`}
    </section>
    <section class="detail-section">
      <div class="section-head tight"><h3>Communication Timeline</h3><button data-screen="email">Follow up</button></div>
      ${communications.length ? `<div class="comm-list">${communications.slice(0, 4).map((comm) => `
        <div class="comm-row ${comm.direction}">
          <span>${icon(iconForChannel(comm.channel))}</span>
          <div><b>${labelForCommunication(comm)}</b><em>${escapeHtml(comm.subject || truncate(comm.body, 64))}</em></div>
          <strong>${escapeHtml(comm.status)}</strong>
        </div>
      `).join("")}</div>` : `<p class="empty-note">Inbound calls, emails, texts, and queued follow-ups will appear here.</p>`}
    </section>
    <section class="action-dock">
      <h3>AI Actions</h3>
      <div class="action-grid">
        <button data-screen="email">${icon("mail")}<span>Follow-up<br>Email</span></button>
        <button data-action="estimate">${icon("dollar")}<span>Estimate</span></button>
        <button data-action="site-check">${icon("calendar")}<span>Site Visit<br>Checklist</span></button>
        <button data-action="scope">${icon("file")}<span>Scope of<br>Work</span></button>
        <button data-screen="proposal">${icon("file")}<span>Proposal<br>Draft</span></button>
      </div>
      ${state.savedNotice ? `<p class="notice">${state.savedNotice}</p>` : ""}
    </section>
  `, state, { back: true, actions: `<button class="link-btn" data-action="edit-details">Edit</button><button class="dots" data-action="more-actions" aria-label="More actions">${icon("more")}</button>` });
}

function iconForChannel(channel) {
  if (channel === "email") return "mail";
  if (channel === "phone") return "phone";
  if (channel === "text") return "mail";
  return "file";
}

function labelForCommunication(comm) {
  const direction = comm.direction === "outbound" ? "Outbound" : "Inbound";
  const channel = {
    email: "Email",
    phone: "Call",
    text: "Text",
    internal_note: "Note"
  }[comm.channel] || "Communication";
  return `${direction} ${channel}`;
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
