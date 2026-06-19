import { icon } from "../../lib/icons.js";
import { shell } from "../components.js";

export function docsScreen({ state, selected }) {
  const item = selected();
  const files = state.uploadedFiles[item.id] || [];
  const products = Object.values(state.generatedProducts[item.id] || {}).filter((product, index, list) => product?.documentType && list.findIndex((item) => item.documentType === product.documentType) === index);
  return shell(`
    <h2 class="page-title">Docs</h2>
    <div class="doc-grid">
      <button data-screen="email">${icon("mail")}<span>Follow-up Email</span><em>Generate and save missing-info requests.</em></button>
      <button data-screen="proposal">${icon("file")}<span>Proposal Draft</span><em>Review scope, terms, and confidence.</em></button>
      <button data-action="scope">${icon("file")}<span>Scope of Work</span><em>Copy a customer-ready service scope.</em></button>
      <button data-action="site-check">${icon("calendar")}<span>Site Checklist</span><em>Track access, inventory, utilities, and photos.</em></button>
      <button data-action="templates">${icon("briefcase")}<span>Template Library</span><em>Open reusable DCDcom workflow templates.</em></button>
    </div>
    <div class="section-head"><h3>Saved AI Documents</h3><button data-action="more-actions">History</button></div>
    ${products.length ? `<div class="saved-doc-list">${products.map((product) => `
      <article>
        ${icon(iconForDocument(product.documentType))}
        <div><b>${labelForDocument(product.documentType)}</b><span>${product.title}</span><em>${product.confidenceScore || 70}% confidence</em></div>
        <button data-screen="${product.documentType === "proposal" ? "proposal" : product.documentType === "follow_up_email" ? "email" : "docs"}">Open</button>
      </article>
    `).join("")}</div>` : `<p class="empty-note">Generated emails, scopes, estimates, checklists, and proposals will appear here after they are saved.</p>`}
    <div class="section-head"><h3>Files & Site Evidence</h3><button data-screen="add" data-tab-target="Photo">Add File</button></div>
    ${files.length ? `<div class="attachment-list">${files.map((file) => `<a href="${file.url || "#"}" target="_blank" rel="noreferrer">${icon(file.category === "photo" ? "camera" : "file")}<span>${file.fileName}</span><em>${formatBytes(file.sizeBytes)}</em></a>`).join("")}</div>` : `<p class="empty-note">No files linked to ${item.title} yet.</p>`}
  `, state);
}

export function moreScreen({ state }) {
  return shell(`
    <h2 class="page-title">More</h2>
    <div class="settings-list">
      <button data-action="account">${icon("user")} Account</button>
      <button data-action="notifications">${icon("bell")} Notifications</button>
      <button data-action="templates">${icon("file")} DCDcom Templates</button>
      <button data-action="integrations">${icon("briefcase")} Integrations</button>
      <button data-action="more-actions">${icon("refresh")} Action History</button>
    </div>
  `, state);
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function labelForDocument(type) {
  return {
    follow_up_email: "Follow-up Email",
    proposal: "Proposal Draft",
    scope_of_work: "Scope of Work",
    site_checklist: "Site Checklist",
    estimate: "Estimate"
  }[type] || "Document";
}

function iconForDocument(type) {
  return {
    follow_up_email: "mail",
    proposal: "file",
    scope_of_work: "file",
    site_checklist: "calendar",
    estimate: "dollar"
  }[type] || "file";
}
