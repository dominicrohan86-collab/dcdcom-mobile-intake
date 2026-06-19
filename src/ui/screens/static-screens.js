import { icon } from "../../lib/icons.js";
import { shell } from "../components.js";

export function docsScreen({ state }) {
  return shell(`
    <h2 class="page-title">Docs</h2>
    <div class="doc-grid">
      <button data-screen="email">${icon("mail")}<span>Follow-up Email</span><em>Generate and save missing-info requests.</em></button>
      <button data-screen="proposal">${icon("file")}<span>Proposal Draft</span><em>Review scope, terms, and confidence.</em></button>
      <button data-action="scope">${icon("file")}<span>Scope of Work</span><em>Copy a customer-ready service scope.</em></button>
      <button data-action="site-check">${icon("calendar")}<span>Site Checklist</span><em>Track access, inventory, utilities, and photos.</em></button>
      <button data-action="templates">${icon("briefcase")}<span>Template Library</span><em>Open reusable DCDcom workflow templates.</em></button>
    </div>
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
