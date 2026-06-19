import { icon } from "../../lib/icons.js";
import { extractFromText } from "../../lib/extraction.js";
import { badge, shell } from "../components.js";

export function addInquiryScreen({ state }) {
  const localPreview = extractFromText(state.inputText);
  const preview = state.aiPreview && state.aiPreviewText === state.inputText ? state.aiPreview : localPreview;
  const previewMode = state.aiPreview && state.aiPreviewText === state.inputText ? state.aiMode : "local";
  const tabs = ["Call Notes", "Email", "Manual", "Photo"];
  const tabIcon = (tab) => tab === "Call Notes" ? "phone" : tab === "Email" ? "mail" : tab === "Manual" ? "edit" : "camera";
  const label = state.inquiryTab === "Email" ? "Paste Email" : state.inquiryTab === "Photo" ? "Photo Notes / OCR Text" : state.inquiryTab === "Manual" ? "Manual Inquiry Notes" : "Paste Call Notes";
  const selectedFiles = state.uploadedFiles[state.selectedId] || [];

  return shell(`
    <div class="form-screen">
      <div class="add-tabs">
        ${tabs.map((tab) => `<button class="${state.inquiryTab === tab ? "active" : ""}" data-tab="${tab}">${icon(tabIcon(tab))}<span>${tab}</span></button>`).join("")}
      </div>
      <label class="field-label">${label}</label>
      ${state.inquiryTab === "Photo" ? `
        <div class="upload-card">
          <label class="file-picker">
            ${icon("camera")}
            <span>${state.pendingPhoto ? state.pendingPhoto.name : "Choose site photo, floor plan, or equipment list"}</span>
            <input id="photoUpload" type="file" accept="image/*,.pdf,.csv,.xlsx,.xls,.doc,.docx"/>
          </label>
          <button class="secondary full" data-action="upload-photo" ${state.fileUploading || !state.pendingPhoto ? "disabled" : ""}>${state.fileUploading ? "Uploading..." : "Upload Attachment"}</button>
          ${selectedFiles.length ? `<div class="attachment-list">${selectedFiles.map((file) => `<a href="${file.url || "#"}" target="_blank" rel="noreferrer">${icon(file.category === "photo" ? "camera" : "file")}<span>${file.fileName}</span><em>${formatBytes(file.sizeBytes)}</em></a>`).join("")}</div>` : ""}
        </div>
      ` : ""}
      <textarea id="inquiryText" maxlength="2000">${state.inputText}</textarea>
      <div class="char-count">${state.inputText.length}/2000</div>
      <div class="preview-title">
        <div>
          <h3>AI Extraction Preview</h3>
          <p>${state.aiLoading ? "Analyzing customer text..." : previewMode === "live" ? "Live OpenAI analysis applied" : previewMode === "fallback" ? "Server fallback analysis applied" : "Local instant preview"}</p>
        </div>
        ${badge(`Confidence: ${preview.confidence}%`, preview.confidence > 80 ? "Low" : "Medium")}
      </div>
      <div class="extract-card">
        ${preview.rows.map((row) => `
          <div class="extract-row">
            <span>${icon(row.icon)}</span><b>${row.label}</b><em>${row.value}</em><button data-action="edit-details" data-edit-row="${row.label}" aria-label="Edit ${row.label}">${icon("edit")}</button>
          </div>
        `).join("")}
      </div>
      <button class="secondary full" data-action="run-ai-analysis" ${state.aiLoading || !state.inputText.trim() ? "disabled" : ""}>${icon("spark")} ${state.aiLoading ? "Analyzing..." : "Run Live AI Analysis"}</button>
      <button class="primary full" data-action="save-opportunity" ${state.savingInquiry || !state.inputText.trim() ? "disabled" : ""}>${state.savingInquiry ? "Saving..." : "Save Opportunity"}</button>
      <button class="secondary full" data-action="generate-questions">${icon("spark")} Generate Questions</button>
      ${state.aiError ? `<p class="notice warning">${state.aiError}</p>` : ""}
      ${state.savedNotice ? `<p class="notice">${state.savedNotice}</p>` : ""}
    </div>
  `, state, { title: "Add Inquiry", back: true });
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
