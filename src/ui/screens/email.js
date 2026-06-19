import { emailText } from "../../lib/drafts.js";
import { icon } from "../../lib/icons.js";
import { badge, shell } from "../components.js";

export function emailScreen({ state, selected }) {
  const tones = ["Professional", "Concise", "Warm", "Formal"];
  const include = [
    ["missing", "Missing questions"],
    ["visit", "Site visit suggestion"],
    ["overview", "Service overview"],
    ["timeline", "Timeline discussion"],
    ["photos", "Request for photos"],
    ["budget", "Budget discussion"]
  ];
  const draft = emailText(selected(), state);

  return shell(`
    <section class="composer">
      <h3>Tone</h3>
      <div class="segmented">${tones.map((tone) => `<button class="${state.tone === tone ? "active" : ""}" data-tone="${tone}">${tone}</button>`).join("")}</div>
      <h3>Include</h3>
      <div class="include-box">${include.map(([key, label]) => `<label><input type="checkbox" data-include="${key}" ${state.includeOptions[key] ? "checked" : ""}/> <span>${label}</span></label>`).join("")}</div>
      <div class="section-head tight"><h3>Email Draft</h3><button data-action="toggle-edit">${state.emailEditable ? "Done" : "Edit"}</button></div>
      <article class="draft-card">
        <div class="subject"><b>Subject:</b> Quick follow-up on your data center project <button data-action="copy">${icon("copy")}</button></div>
        <textarea id="emailDraft" ${state.emailEditable ? "" : "readonly"}>${draft}</textarea>
      </article>
      <article class="confidence-card">
        <div><h3>AI Confidence ${badge("Medium", "Medium")}</h3><p>Based on 6 extracted details. Missing key scope and inventory information.</p></div>
        <button data-action="view-confidence">View details ›</button>
      </article>
      <div class="bottom-actions">
        <button class="secondary" data-action="regenerate">${icon("refresh")} Regenerate</button>
        <button class="primary" data-action="toggle-edit">${icon("edit")} Edit</button>
        <button class="success" data-action="save-draft">${icon("check")} Save</button>
      </div>
      ${state.savedNotice ? `<p class="notice">${state.savedNotice}</p>` : ""}
    </section>
  `, state, { title: "Generate Follow-up Email", back: true, nav: false, actions: `<button class="link-btn" data-action="save-draft">Save Draft</button>` });
}
