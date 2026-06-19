import { emailText } from "../lib/drafts.js";
import { confidenceBreakdown, estimateFor, scopeBullets } from "../lib/workflows.js";
import { icon } from "../lib/icons.js";

export function actionPanel({ state, selected }) {
  if (!state.modal) return "";
  const item = selected();
  const content = panels[state.modal]?.(item, state) || panels.more(item, state);
  return `
    <div class="sheet-backdrop" data-action="close-modal">
      <section class="action-sheet" role="dialog" aria-modal="true" aria-label="${content.title}">
        <div class="sheet-grip"></div>
        <div class="sheet-head">
          <h3>${content.title}</h3>
          <button data-action="close-modal" aria-label="Close">×</button>
        </div>
        ${content.body}
      </section>
    </div>
  `;
}

const money = (value) => `$${value.toLocaleString()}`;

const panels = {
  estimate(item) {
    const estimate = estimateFor(item);
    return {
      title: "Estimate Builder",
      body: `
        <div class="estimate-grid">
          <div><span>Labor</span><b>${money(estimate.labor)}</b></div>
          <div><span>Logistics</span><b>${money(estimate.logistics)}</b></div>
          <div><span>Recycling</span><b>${money(estimate.recycling)}</b></div>
          <div><span>Contingency</span><b>${money(estimate.contingency)}</b></div>
        </div>
        <div class="estimate-total"><span>Recommended range</span><strong>${money(estimate.low)} - ${money(estimate.high)}</strong><em>Target margin ${estimate.margin}</em></div>
        <button class="primary full" data-action="save-estimate">${icon("check")} Save Estimate</button>
      `
    };
  },
  "site-check"(item, state) {
    const checks = [
      ["access", "Confirm site access window"],
      ["photos", "Request photos / floor plan"],
      ["inventory", "Validate rack and equipment inventory"],
      ["utilities", "Confirm electrical disconnect and utility shutoff"],
      ["security", "Document escort and loading dock requirements"]
    ];
    return {
      title: "Site Visit Checklist",
      body: `
        <div class="check-panel">
          ${checks.map(([key, label]) => `<label><input type="checkbox" data-checklist="${key}" ${state.checklist[key] ? "checked" : ""}/> <span>${label}</span></label>`).join("")}
        </div>
        <button class="primary full" data-action="complete-checklist">${icon("check")} Save Checklist</button>
      `
    };
  },
  scope(item) {
    return {
      title: "Scope of Work",
      body: `
        <div class="scope-preview">
          <h4>${item.title}</h4>
          <ul>${scopeBullets(item).map((line) => `<li>${line}</li>`).join("")}</ul>
        </div>
        <button class="secondary full" data-action="copy-scope">${icon("copy")} Copy Scope</button>
        <button class="primary full" data-screen="proposal">${icon("file")} Open Proposal</button>
      `
    };
  },
  "edit-details"(item) {
    return {
      title: "Edit Extracted Details",
      body: `
        <div class="edit-form">
          <label>Contact<input id="editContact" value="${item.contact}"/></label>
          <label>Email<input id="editEmail" value="${item.email}"/></label>
          <label>Phone<input id="editPhone" value="${item.phone}"/></label>
          <label>Access Notes<input id="editAccess" value="${item.captured.find(([k]) => k.includes("access"))?.[1] || "After hours"}"/></label>
        </div>
        <button class="primary full" data-action="save-details">${icon("check")} Save Details</button>
      `
    };
  },
  "view-confidence"(item) {
    return {
      title: "AI Confidence Details",
      body: `
        <div class="confidence-list">
          ${confidenceBreakdown(item).map(([name, status, score]) => `
            <div><span>${name}</span><b>${status}</b><meter min="0" max="100" value="${score}"></meter></div>
          `).join("")}
        </div>
      `
    };
  },
  "contact-actions"(item) {
    return {
      title: "Customer Contact",
      body: `
        <div class="contact-card">
          <b>${item.contact}</b><span>${item.company}</span>
          <a href="tel:${item.phone.replace(/\D/g, "")}">${icon("phone")} ${item.phone}</a>
          <a href="mailto:${item.email}">${icon("mail")} ${item.email}</a>
        </div>
        <button class="primary full" data-screen="email">${icon("mail")} Generate Follow-up Email</button>
      `
    };
  },
  templates(item) {
    return {
      title: "Template Library",
      body: `
        <div class="template-list">
          <button data-screen="email">${icon("mail")} Follow-up email</button>
          <button data-screen="proposal">${icon("file")} Proposal draft</button>
          <button data-action="scope">${icon("file")} Scope of work</button>
          <button data-action="site-check">${icon("calendar")} Site visit checklist</button>
        </div>
      `
    };
  },
  notifications() {
    return {
      title: "Notification Rules",
      body: `
        <div class="settings-form">
          <label><input type="checkbox" checked/> Alert when high priority inquiries arrive</label>
          <label><input type="checkbox" checked/> Remind me before lease deadlines</label>
          <label><input type="checkbox"/> Send digest at end of day</label>
        </div>
        <button class="primary full" data-action="save-settings">${icon("check")} Save Rules</button>
      `
    };
  },
  account() {
    return {
      title: "Account",
      body: `
        <div class="contact-card"><b>Alex Morgan</b><span>DCDcom estimator</span><span>alex@dcdcom.com</span></div>
        <button class="primary full" data-action="save-settings">${icon("check")} Save Profile</button>
      `
    };
  },
  integrations() {
    return {
      title: "Integrations",
      body: `
        <div class="integration-list">
          <div><b>CRM</b><span>Ready to sync opportunities</span><button data-action="connect-integration">Connect</button></div>
          <div><b>Email</b><span>Drafts can be exported to your mailbox</span><button data-action="connect-integration">Connect</button></div>
          <div><b>Calendar</b><span>Site visits can create holds</span><button data-action="connect-integration">Connect</button></div>
        </div>
      `
    };
  },
  more(item, state) {
    return {
      title: "Action History",
      body: `
        <ol class="activity-list">${state.activity.map((entry) => `<li>${entry}</li>`).join("")}</ol>
        <button class="secondary full" data-action="sync-crm">${icon("refresh")} Sync to CRM</button>
      `
    };
  }
};
