import { icon } from "../../lib/icons.js";
import { badge, shell } from "../components.js";

export function detailScreen({ state, selected }) {
  const item = selected();
  const missingRows = item.missingFull.map((m) => `<li class="todo"><span></span>${m}</li>`).join("");
  const capturedRows = item.captured.map(([k, v]) => `<li class="done"><span></span><b>${k}</b><em>${v}</em></li>`).join("");
  const summary = state.expandedSummary
    ? `${item.summary} Recommended next step: confirm ${item.missingFull.slice(0, 3).join(", ").toLowerCase()} before committing labor or recycling assumptions.`
    : item.summary;

  return shell(`
    <section class="detail-head">
      <h2>${item.title}</h2>
      ${badge(item.service, "blue")}
      <div class="meta-line"><span>${icon("pin")} ${item.location}</span><span>${icon("calendar")} Lease End: Jul 31, 2025</span></div>
      <div class="badge-row">${badge(`${item.workload} Workload`, item.workload)}${badge(`${item.priority} Priority`, item.priority)}</div>
    </section>
    <section class="summary-card">
      <div class="card-title"><h3>${icon("spark")} AI Summary</h3><span>Generated 2h ago</span></div>
      <p>${summary}</p>
      <button data-action="expand-summary">${state.expandedSummary ? "Show less⌃" : "Show more⌄"}</button>
    </section>
    <section class="detail-section">
      <div class="section-head tight"><h3>Missing Information</h3><span class="count-pill">5 of 8</span></div>
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
