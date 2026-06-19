import { emailText } from "../../lib/drafts.js";
import { icon } from "../../lib/icons.js";
import { badge, shell } from "../components.js";

export function emailScreen({ state, selected }) {
  const item = selected();
  const generated = state.generatedProducts[item.id]?.follow_up_email;
  const edited = state.documentDrafts[item.id]?.follow_up_email;
  const tones = ["Professional", "Concise", "Warm", "Formal"];
  const include = [
    ["missing", "Missing questions"],
    ["visit", "Site visit suggestion"],
    ["overview", "Service overview"],
    ["timeline", "Timeline discussion"],
    ["photos", "Request for photos"],
    ["budget", "Budget discussion"]
  ];
  const draft = edited?.body ?? generated?.body ?? emailText(item, state);
  const subject = edited?.subject ?? generated?.subject ?? "Quick follow-up on your data center project";
  const busy = state.aiActionLoading === "follow_up_email";
  const sendBusy = state.aiActionLoading === "send_follow_up";
  const editedLabel = edited ? `<span class="draft-status">Edited</span>` : "";

  return shell(`
    <section class="composer">
      <h3>Tone</h3>
      <div class="segmented">${tones.map((tone) => `<button class="${state.tone === tone ? "active" : ""}" data-tone="${tone}">${tone}</button>`).join("")}</div>
      <h3>Include</h3>
      <div class="include-box">${include.map(([key, label]) => `<label><input type="checkbox" data-include="${key}" ${state.includeOptions[key] ? "checked" : ""}/> <span>${label}</span></label>`).join("")}</div>
      <div class="section-head tight"><h3>Email Draft</h3><button data-action="toggle-edit">${state.emailEditable ? "Done" : "Edit"}</button></div>
      <article class="draft-card">
        <div class="subject"><b>Subject:</b> ${escapeHtml(subject)} ${editedLabel} <button data-action="copy">${icon("copy")}</button></div>
        <textarea id="emailDraft" ${state.emailEditable ? "" : "readonly"}>${escapeHtml(draft)}</textarea>
      </article>
      <article class="confidence-card">
        <div><h3>AI Confidence ${badge(generated?.confidenceScore > 82 ? "High" : "Medium", generated?.confidenceScore > 82 ? "Low" : "Medium")}</h3><p>${generated ? `${generated.confidenceScore}% confidence. ${generated.missingRiskNotes?.[0] || "Review before sending."}` : "Based on extracted details. Missing key scope and inventory information."}</p></div>
        <button data-action="view-confidence">View details ›</button>
      </article>
      <div class="bottom-actions">
        <button class="secondary" data-action="regenerate" ${busy ? "disabled" : ""}>${icon("refresh")} ${busy ? "Generating..." : "Regenerate"}</button>
        <button class="primary" data-action="toggle-edit">${icon("edit")} Edit</button>
        <button class="success" data-action="save-draft" ${busy ? "disabled" : ""}>${icon("check")} ${busy ? "Saving..." : "Save"}</button>
        <button class="primary wide" data-action="send-follow-up" ${sendBusy ? "disabled" : ""}>${icon("mail")} ${sendBusy ? "Queueing..." : "Queue Send"}</button>
      </div>
      ${state.aiError ? `<p class="notice warning">${state.aiError}</p>` : ""}
      ${state.savedNotice ? `<p class="notice">${state.savedNotice}</p>` : ""}
    </section>
  `, state, { title: "Generate Follow-up Email", back: true, nav: false, actions: `<button class="link-btn" data-action="save-draft" ${busy ? "disabled" : ""}>Save Draft</button>` });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
