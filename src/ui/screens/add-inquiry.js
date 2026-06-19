import { icon } from "../../lib/icons.js";
import { extractFromText } from "../../lib/extraction.js";
import { badge, shell } from "../components.js";

export function addInquiryScreen({ state }) {
  const preview = extractFromText(state.inputText);
  const tabs = ["Call Notes", "Email", "Manual", "Photo"];
  const tabIcon = (tab) => tab === "Call Notes" ? "phone" : tab === "Email" ? "mail" : tab === "Manual" ? "edit" : "camera";
  const label = state.inquiryTab === "Email" ? "Paste Email" : state.inquiryTab === "Photo" ? "Photo Notes / OCR Text" : state.inquiryTab === "Manual" ? "Manual Inquiry Notes" : "Paste Call Notes";

  return shell(`
    <div class="form-screen">
      <div class="add-tabs">
        ${tabs.map((tab) => `<button class="${state.inquiryTab === tab ? "active" : ""}" data-tab="${tab}">${icon(tabIcon(tab))}<span>${tab}</span></button>`).join("")}
      </div>
      <label class="field-label">${label}</label>
      <textarea id="inquiryText" maxlength="2000">${state.inputText}</textarea>
      <div class="char-count">${state.inputText.length}/2000</div>
      <div class="preview-title"><h3>AI Extraction Preview</h3>${badge(`Confidence: ${preview.confidence}%`, preview.confidence > 80 ? "Low" : "Medium")}</div>
      <div class="extract-card">
        ${preview.rows.map((row) => `
          <div class="extract-row">
            <span>${icon(row.icon)}</span><b>${row.label}</b><em>${row.value}</em><button data-action="edit-details" data-edit-row="${row.label}" aria-label="Edit ${row.label}">${icon("edit")}</button>
          </div>
        `).join("")}
      </div>
      <button class="primary full" data-action="save-opportunity">Save Opportunity</button>
      <button class="secondary full" data-action="generate-questions">${icon("spark")} Generate Questions</button>
      ${state.savedNotice ? `<p class="notice">${state.savedNotice}</p>` : ""}
    </div>
  `, state, { title: "Add Inquiry", back: true });
}
