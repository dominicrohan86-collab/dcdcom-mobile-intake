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
  estimate(item, state) {
    const generated = state.generatedProducts[item.id]?.estimate || state.generatedProducts[item.id]?.proposal;
    const estimate = estimateFor(item);
    const lineItems = generated?.estimate?.lineItems || [
      ["Labor", estimate.labor],
      ["Logistics", estimate.logistics],
      ["Recycling", estimate.recycling],
      ["Contingency", estimate.contingency]
    ].map(([description, value]) => ({ description, unitCostCents: value * 100 }));
    const low = generated?.estimate?.lowCents ? Math.round(generated.estimate.lowCents / 100) : estimate.low;
    const high = generated?.estimate?.highCents ? Math.round(generated.estimate.highCents / 100) : estimate.high;
    return {
      title: "Estimate Builder",
      body: `
        <div class="estimate-grid">
          ${lineItems.slice(0, 4).map((line) => `<div><span>${line.description}</span><b>${money(Math.round((line.quantity || 1) * (line.unitCostCents || 0) / 100))}</b></div>`).join("")}
        </div>
        <div class="estimate-total"><span>Recommended range</span><strong>${money(low)} - ${money(high)}</strong><em>${generated?.estimate?.assumptions || `Target margin ${estimate.margin}`}</em></div>
        <button class="primary full" data-action="save-estimate">${icon("check")} Save Estimate</button>
      `
    };
  },
  "site-check"(item, state) {
    const generated = state.generatedProducts[item.id]?.site_checklist;
    const visit = state.siteVisits[item.id]?.[0];
    const checks = visit?.checklistItems?.length
      ? visit.checklistItems.map((check) => [check.id, check.label, check.status])
      : generated?.body
      ? generated.body.split("\n").map((line, index) => [`ai-${index}`, line.replace(/^[-*\d.\s]+/, "").trim()]).filter(([, label]) => label)
      : [
      ["access", "Confirm site access window"],
      ["photos", "Request photos / floor plan"],
      ["inventory", "Validate rack and equipment inventory"],
      ["utilities", "Confirm electrical disconnect and utility shutoff"],
      ["security", "Document escort and loading dock requirements"]
    ];
    return {
      title: "Site Visit Checklist",
      body: `
        <div class="visit-summary">
          <b>${visit ? visitStatusLabel(visit) : "No scheduled visit"}</b>
          <span>${visit?.scheduledStart ? formatDateTime(visit.scheduledStart) : "Create a calendar-ready site visit hold for field verification."}</span>
        </div>
        <div class="check-panel">
          ${checks.map(([key, label, status]) => `<label><input type="checkbox" data-checklist="${key}" ${status === "done" || state.checklist[key] ? "checked" : ""}/> <span>${escapeHtml(label)}</span></label>`).join("")}
        </div>
        <button class="secondary full" data-action="schedule-site-visit">${icon("calendar")} ${visit ? "Reschedule Site Visit" : "Schedule Site Visit"}</button>
        <button class="primary full" data-action="complete-checklist">${icon("check")} Save Checklist</button>
      `
    };
  },
  scope(item, state) {
    const generated = state.generatedProducts[item.id]?.scope_of_work;
    return {
      title: "Scope of Work",
      body: `
        <div class="scope-preview">
          <h4>${item.title}</h4>
          ${generated ? `<p>${escapeHtml(generated.body).replace(/\n/g, "<br>")}</p>` : `<ul>${scopeBullets(item).map((line) => `<li>${line}</li>`).join("")}</ul>`}
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
          <label>Contact<input id="editContact" value="${escapeHtml(item.contact)}"/></label>
          <label>Email<input id="editEmail" value="${escapeHtml(item.email)}"/></label>
          <label>Phone<input id="editPhone" value="${escapeHtml(item.phone)}"/></label>
          <label>Access Notes<input id="editAccess" value="${escapeHtml(item.captured.find(([k]) => k.toLowerCase().includes("access"))?.[1] || "After hours")}"/></label>
        </div>
        <button class="primary full" data-action="save-details">${icon("check")} Save Details</button>
      `
    };
  },
  "proposal-edit"(item, state) {
    const generated = state.generatedProducts[item.id]?.proposal;
    const fallback = `Scope\nProvide turnkey decommissioning of ${item.title} including equipment removal, cable management, asset recovery, and site cleanup.\n\nAssumptions\nEstimate assumes customer-provided access, inventory validation, normal loading conditions, and no unknown hazardous materials.\n\nDeliverables\nCloseout report, site photos, recycling documentation, asset recovery list, and completion certification.\n\nTerms\nPricing is valid for 30 days and work begins after written approval and site walk confirmation.`;
    return {
      title: "Edit Proposal Draft",
      body: `
        <div class="edit-form">
          <label>Title<input id="proposalTitle" value="${escapeHtml(generated?.title || `${item.title} Proposal`)}"/></label>
          <label>Proposal Body<textarea id="proposalBody">${escapeHtml(generated?.body || fallback)}</textarea></label>
        </div>
        <button class="primary full" data-action="save-proposal-edits">${icon("check")} Save Proposal Version</button>
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
  notifications(item, state) {
    const settings = parseSettings(state.preferences?.settings_json);
    return {
      title: "Notification Rules",
      body: `
        <div class="settings-form">
          <label><input type="checkbox" data-setting="highPriorityAlerts" ${settings.highPriorityAlerts !== false ? "checked" : ""}/> Alert when high priority inquiries arrive</label>
          <label><input type="checkbox" data-setting="leaseDeadlineReminders" ${settings.leaseDeadlineReminders !== false ? "checked" : ""}/> Remind me before lease deadlines</label>
          <label><input type="checkbox" data-setting="dailyDigest" ${settings.dailyDigest ? "checked" : ""}/> Send digest at end of day</label>
        </div>
        <button class="primary full" data-action="save-settings">${icon("check")} Save Rules</button>
      `
    };
  },
  account(item, state) {
    const user = state.user || { fullName: "Alex Morgan", email: "alex@dcdcom.com", role: "project_manager" };
    return {
      title: "Account",
      body: `
        <div class="edit-form">
          <label>Name<input id="profileName" value="${escapeHtml(user.fullName || user.full_name || "Alex Morgan")}"/></label>
          <label>Email<input id="profileEmail" value="${escapeHtml(user.email || "alex@dcdcom.com")}" readonly/></label>
          <label>Role<input id="profileRole" value="${escapeHtml(roleLabel(user.role || "project_manager"))}" readonly/></label>
        </div>
        <button class="primary full" data-action="save-profile">${icon("check")} Save Profile</button>
      `
    };
  },
  integrations(item, state) {
    const connected = new Set((state.integrations || []).filter((integration) => integration.status === "connected").map((integration) => integration.provider));
    return {
      title: "Integrations",
      body: `
        <div class="integration-list">
          <div><b>CRM</b><span>${connected.has("crm") ? "Connected for opportunity sync" : "Ready to sync opportunities"}</span><button data-action="connect-integration" data-provider="crm">${connected.has("crm") ? "Reconnect" : "Connect"}</button></div>
          <div><b>Email</b><span>${connected.has("email") ? "Connected for draft export" : "Drafts can be exported to your mailbox"}</span><button data-action="connect-integration" data-provider="email">${connected.has("email") ? "Reconnect" : "Connect"}</button></div>
          <div><b>Calendar</b><span>${connected.has("calendar") ? "Connected for site visit holds" : "Site visits can create holds"}</span><button data-action="connect-integration" data-provider="calendar">${connected.has("calendar") ? "Reconnect" : "Connect"}</button></div>
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function parseSettings(value) {
  if (!value) return {};
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return {};
  }
}

function roleLabel(role) {
  return String(role || "project_manager").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function visitStatusLabel(visit) {
  return `${String(visit.status || "needed").replace("_", " ")} site visit`;
}

function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
