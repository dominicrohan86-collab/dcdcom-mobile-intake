import { emailText } from "./lib/drafts.js";
import { extractFromText } from "./lib/extraction.js";
import { analyzeIntakePreview, bootstrapWorkspace, connectIntegration, generateInquiryWorkProduct, getInquiryDetail, saveInquiryDocument, saveInquiryFromSource, saveSettings, syncInquiry, updateInquiryStatus, uploadInquiryFile } from "./lib/api-client.js";
import { scopeBullets } from "./lib/workflows.js";
import { inquiries } from "./state/inquiries.js";
import { state } from "./state/app-state.js";
import { actionPanel } from "./ui/action-panel.js";
import { addInquiryScreen } from "./ui/screens/add-inquiry.js";
import { detailScreen } from "./ui/screens/detail.js";
import { docsScreen, moreScreen } from "./ui/screens/static-screens.js";
import { emailScreen } from "./ui/screens/email.js";
import { pipelineScreen } from "./ui/screens/pipeline.js";
import { proposalScreen } from "./ui/screens/proposal.js";
import { todayScreen } from "./ui/screens/today.js";

const app = document.querySelector("#app");

function selected() {
  return inquiries.find((item) => item.id === state.selectedId) || inquiries[0];
}

function setScreen(screen, patch = {}, options = {}) {
  if (options.push && screen !== state.screen) {
    state.history.push(state.screen);
    state.history = state.history.slice(-12);
  }
  Object.assign(state, patch, { screen, modal: patch.modal ?? null });
  render();
}

function goBack() {
  if (state.modal) {
    state.modal = null;
    return render();
  }
  const previous = state.history.pop() || "today";
  setScreen(previous, { savedNotice: "", modal: null });
}

function addActivity(entry) {
  state.activity.unshift(entry);
  state.activity = state.activity.slice(0, 8);
}

async function hydrateFromApi() {
  try {
    const boot = await bootstrapWorkspace();
    if (Array.isArray(boot.inquiries) && boot.inquiries.length) {
      inquiries.splice(0, inquiries.length, ...boot.inquiries.map(inquiryFromApiRow));
      if (!inquiries.some((item) => item.id === state.selectedId)) state.selectedId = inquiries[0].id;
      state.preferences = boot.preferences || state.preferences;
      state.integrations = boot.integrations || state.integrations;
      addActivity("Loaded live D1 inquiry queue");
      render();
    }
  } catch {
    // Static dev server and unconfigured D1 environments intentionally keep mock state.
  }
}

async function refreshInquiryDetail(inquiryId) {
  try {
    const detail = await getInquiryDetail(inquiryId);
    const next = inquiryFromDetail(detail);
    const index = inquiries.findIndex((item) => item.id === inquiryId);
    if (index >= 0) inquiries[index] = { ...inquiries[index], ...next };
    else inquiries.unshift(next);
    state.uploadedFiles[inquiryId] = (detail.files || []).map(publicFileFromApi);
    hydrateGeneratedProducts(inquiryId, detail.documents || []);
    render();
  } catch {
    // Keep current local detail when the worker API is unavailable.
  }
}

function hydrateGeneratedProducts(inquiryId, documents) {
  const products = { ...(state.generatedProducts[inquiryId] || {}) };
  for (const document of documents) {
    const product = productFromDocument(document);
    products[product.documentType] = product;
    if (product.documentType === "proposal") products.proposal = product;
  }
  state.generatedProducts[inquiryId] = products;
}

function addOpportunityFromLocal() {
  const preview = extractFromText(state.inputText);
  const rows = Object.fromEntries(preview.rows.map((row) => [row.label, row.value]));
  const id = `saved-${Date.now()}`;
  inquiries.unshift({
    id,
    company: rows.Service === "Data Center Decommissioning" ? "NTT Data" : "New Inquiry",
    title: `${rows.Service === "Data Center Decommissioning" ? "NTT Data" : "New Inquiry"} - ${rows.Location}`,
    service: rows.Service,
    location: rows.Location,
    contact: rows.Contact,
    phone: "(571) 555-0100",
    email: "customer@example.com",
    received: "just now",
    last: "just now",
    value: "$25k-$45k",
    range: "$28,500 - $45,000",
    workload: "Medium",
    priority: "High",
    confidence: preview.confidence,
    missingCount: rows["Missing Info"] === "None" ? 0 : rows["Missing Info"].split(",").length,
    missing: rows["Missing Info"] === "None" ? [] : rows["Missing Info"].split(",").map((x) => x.trim()),
    missingFull: rows["Missing Info"] === "None" ? [] : rows["Missing Info"].split(",").map((x) => x.trim().replace(/^\w/, (c) => c.toUpperCase())),
    captured: [["Timeline", rows.Timeline], ["Equipment", rows.Equipment]],
    summary: "AI captured a new DCDcom opportunity from pasted customer notes. Review missing information, then generate a follow-up email or proposal draft.",
    next: "Send follow-up",
    ai: preview.confidence > 80 ? "High" : "Medium"
  });
  setScreen("detail", { selectedId: id, savedNotice: "Saved as a new opportunity and added to the queue." });
}

async function runAiAnalysis() {
  state.aiLoading = true;
  state.aiError = "";
  state.savedNotice = "";
  render();
  try {
    const result = await analyzeIntakePreview({
      rawText: state.inputText,
      sourceChannel: sourceChannelForTab(state.inquiryTab)
    });
    state.aiPreview = result.preview;
    state.aiPreviewText = state.inputText;
    state.aiMode = result.mode;
    state.aiError = result.error && result.mode !== "live" ? result.error : "";
    state.savedNotice = result.mode === "live" ? "Live AI extraction completed." : "Server fallback extraction completed.";
    addActivity(`${result.mode === "live" ? "Live AI" : "Fallback AI"} analyzed customer intake text`);
  } catch (error) {
    state.aiError = error.message;
    state.savedNotice = "Using local preview until the worker API is available.";
    state.aiMode = "local";
  } finally {
    state.aiLoading = false;
    render();
  }
}

async function saveOpportunity() {
  state.savingInquiry = true;
  state.aiError = "";
  render();
  try {
    const result = await saveInquiryFromSource({
      rawText: state.inputText,
      sourceChannel: sourceChannelForTab(state.inquiryTab),
      subject: `${state.inquiryTab} intake`,
      sender: "Customer"
    });
    const item = inquiryFromAnalysisResult(result);
    inquiries.unshift(item);
    state.aiPreview = result.preview;
    state.aiPreviewText = state.inputText;
    state.aiMode = result.mode;
    addActivity(`${result.mode === "live" ? "Live AI" : "Fallback AI"} saved ${item.title} to the database-backed queue`);
    if (state.pendingPhoto) {
      await uploadSelectedFile(item.id);
    }
    setScreen("detail", {
      selectedId: item.id,
      savedNotice: result.mode === "live" ? "Saved to D1 with live AI extraction." : "Saved with server fallback extraction. Add OPENAI_API_KEY for live AI."
    });
  } catch (error) {
    state.aiError = error.message;
    addOpportunityFromLocal();
    addActivity("Saved opportunity locally because the worker API was unavailable");
  } finally {
    state.savingInquiry = false;
    render();
  }
}

async function uploadSelectedFile(inquiryId = state.selectedId) {
  if (!state.pendingPhoto) {
    state.savedNotice = "Choose a file before uploading.";
    return render();
  }
  state.fileUploading = true;
  state.aiError = "";
  state.savedNotice = "";
  render();
  try {
    const result = await uploadInquiryFile(inquiryId, {
      file: state.pendingPhoto,
      category: categoryForFile(state.pendingPhoto)
    });
    if (!state.uploadedFiles[inquiryId]) state.uploadedFiles[inquiryId] = [];
    state.uploadedFiles[inquiryId].unshift(result.file);
    addActivity(`Uploaded ${result.file.fileName} to ${selected().title}`);
    state.pendingPhoto = null;
    state.savedNotice = "Attachment uploaded and linked to the opportunity.";
  } catch (error) {
    const localUrl = URL.createObjectURL(state.pendingPhoto);
    const localFile = {
      id: `local_${Date.now()}`,
      fileName: state.pendingPhoto.name,
      contentType: state.pendingPhoto.type || "application/octet-stream",
      sizeBytes: state.pendingPhoto.size,
      category: categoryForFile(state.pendingPhoto),
      url: localUrl
    };
    if (!state.uploadedFiles[inquiryId]) state.uploadedFiles[inquiryId] = [];
    state.uploadedFiles[inquiryId].unshift(localFile);
    state.aiError = error.message;
    state.savedNotice = "Stored attachment locally for preview because the worker/R2 API is unavailable.";
    addActivity(`Attached ${localFile.fileName} locally`);
    state.pendingPhoto = null;
  } finally {
    state.fileUploading = false;
    render();
  }
}

async function generateForSelected(type, successMessage) {
  const item = selected();
  state.aiActionLoading = type;
  state.aiError = "";
  state.savedNotice = "";
  render();
  try {
    const result = await generateInquiryWorkProduct(item.id, { type, tone: state.tone });
    if (!state.generatedProducts[item.id]) state.generatedProducts[item.id] = {};
    const product = {
      ...result.product,
      documentId: result.documentId,
      versionId: result.versionId,
      aiRunId: result.aiRunId
    };
    state.generatedProducts[item.id][product.documentType] = product;
    if (type === "proposal") {
      state.generatedProducts[item.id].proposal = product;
    }
    if (state.documentDrafts[item.id]) delete state.documentDrafts[item.id][product.documentType];
    addActivity(`${result.mode === "live" ? "Live AI" : "Fallback AI"} generated ${product.title}`);
    state.savedNotice = successMessage || `${product.title} generated and saved.`;
    return { ...result, product };
  } catch (error) {
    state.aiError = error.message;
    state.savedNotice = "Worker API was unavailable, so this action stayed in local demo mode.";
    addActivity(`Local fallback used for ${type.replaceAll("_", " ")} on ${item.title}`);
    return null;
  } finally {
    state.aiActionLoading = "";
    render();
  }
}

function render() {
  const context = { state, inquiries, selected };
  const screens = {
    today: todayScreen,
    pipeline: pipelineScreen,
    add: addInquiryScreen,
    detail: detailScreen,
    email: emailScreen,
    proposal: proposalScreen,
    docs: docsScreen,
    more: moreScreen
  };
  app.innerHTML = screens[state.screen](context) + actionPanel(context);
  bindScreen();
}

function bindScreen() {
  app.querySelectorAll(".action-sheet").forEach((sheet) => {
    sheet.addEventListener("click", (event) => event.stopPropagation());
  });

  app.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setScreen(button.dataset.screen, {
        savedNotice: "",
        ...(button.dataset.tabTarget ? { inquiryTab: button.dataset.tabTarget } : {})
      }, { push: true });
    });
  });

  app.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      setScreen("detail", { selectedId: el.dataset.open, savedNotice: "", expandedSummary: false }, { push: true });
      refreshInquiryDetail(el.dataset.open);
    });
  });

  app.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setScreen("add", { inquiryTab: button.dataset.tab }));
  });

  app.querySelectorAll("[data-tone]").forEach((button) => {
    button.addEventListener("click", () => setScreen("email", { tone: button.dataset.tone }));
  });

  app.querySelectorAll("[data-proposal-tab]").forEach((button) => {
    button.addEventListener("click", () => setScreen("proposal", { proposalTab: button.dataset.proposalTab }));
  });

  app.querySelectorAll("[data-pipeline-filter]").forEach((button) => {
    button.addEventListener("click", () => setScreen("pipeline", { pipelineFilter: button.dataset.pipelineFilter }));
  });

  app.querySelectorAll("[data-include]").forEach((input) => {
    input.addEventListener("change", () => {
      state.includeOptions[input.dataset.include] = input.checked;
      render();
    });
  });

  app.querySelectorAll("[data-checklist]").forEach((input) => {
    input.addEventListener("change", () => {
      state.checklist[input.dataset.checklist] = input.checked;
      render();
    });
  });

  const search = app.querySelector("#pipelineSearch");
  if (search) {
    search.addEventListener("input", () => {
      state.searchQuery = search.value;
      render();
      const nextSearch = app.querySelector("#pipelineSearch");
      nextSearch.focus();
      nextSearch.selectionStart = nextSearch.selectionEnd = state.searchQuery.length;
    });
  }

  const input = app.querySelector("#inquiryText");
  if (input) {
    input.addEventListener("input", () => {
      state.inputText = input.value;
      state.aiError = "";
      state.savedNotice = "";
      render();
      const nextInput = app.querySelector("#inquiryText");
      nextInput.focus();
      nextInput.selectionStart = nextInput.selectionEnd = state.inputText.length;
    });
  }

  const emailDraft = app.querySelector("#emailDraft");
  if (emailDraft) {
    emailDraft.addEventListener("input", () => {
      const item = selected();
      const generated = state.generatedProducts[item.id]?.follow_up_email;
      if (!state.documentDrafts[item.id]) state.documentDrafts[item.id] = {};
      state.documentDrafts[item.id].follow_up_email = {
        documentId: generated?.documentId,
        subject: state.documentDrafts[item.id].follow_up_email?.subject || generated?.subject || "Quick follow-up on your data center project",
        body: emailDraft.value
      };
      state.savedNotice = "";
    });
  }

  const photoUpload = app.querySelector("#photoUpload");
  if (photoUpload) {
    photoUpload.addEventListener("change", () => {
      state.pendingPhoto = photoUpload.files?.[0] || null;
      state.savedNotice = "";
      state.aiError = "";
      render();
    });
  }

  app.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleAction(button);
    });
  });
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (button.dataset.id) state.selectedId = button.dataset.id;
  if (action === "back") return goBack();
  if (action === "close-modal") {
    state.modal = null;
    return render();
  }
  if (action === "run-ai-analysis") return runAiAnalysis();
  if (action === "upload-photo") return uploadSelectedFile();
  if (action === "save-opportunity") return saveOpportunity();
  if (action === "generate-questions") {
    if (!(state.aiPreview && state.aiPreviewText === state.inputText)) {
      await runAiAnalysis();
    }
    const activePreview = state.aiPreview && state.aiPreviewText === state.inputText ? state.aiPreview : extractFromText(state.inputText);
    const missing = activePreview.rows.find((row) => row.label === "Missing Info").value;
    state.savedNotice = missing === "None" ? "No missing questions detected. Opportunity is ready for estimating." : `Questions generated for: ${missing}.`;
    addActivity(`Generated follow-up questions for ${missing === "None" ? "complete inquiry" : missing}`);
    return render();
  }
  if (action === "toggle-edit") return setScreen("email", { emailEditable: !state.emailEditable });
  if (action === "regenerate") {
    const result = await generateForSelected("follow_up_email", "Follow-up email regenerated and saved as a document.");
    return setScreen("email", { draftVersion: state.draftVersion + 1, savedNotice: result ? "Follow-up email regenerated and saved as a document." : state.savedNotice });
  }
  if (action === "save-draft") {
    const result = await saveEditedEmailDraft();
    return setScreen("email", { savedNotice: result ? "Draft saved to Docs as a new version." : state.savedNotice });
  }
  if (action === "copy") {
    const item = selected();
    const generated = state.generatedProducts[item.id]?.follow_up_email;
    const edited = state.documentDrafts[item.id]?.follow_up_email;
    navigator.clipboard?.writeText(edited?.body ?? generated?.body ?? emailText(item, state));
    state.savedNotice = "Draft copied to clipboard.";
    addActivity(`Copied email draft for ${selected().title}`);
    return render();
  }
  if (action === "proposal-regenerate") {
    const result = await generateForSelected("proposal", "Proposal draft regenerated and saved for review.");
    return setScreen("proposal", { savedNotice: result ? "Proposal draft regenerated and saved for review." : state.savedNotice });
  }
  if (action === "send-review") {
    const result = await generateForSelected("proposal", "Proposal sent to internal review queue.");
    await persistStatus("review");
    if (!result) addActivity(`Sent ${selected().title} proposal to local review queue`);
    return setScreen("proposal", { savedNotice: result ? "Proposal sent to internal review queue." : state.savedNotice });
  }
  if (action === "expand-summary") return setScreen("detail", { expandedSummary: !state.expandedSummary });
  if (action === "phone" || action === "mail") {
    state.modal = "contact-actions";
    return render();
  }
  if (action === "proposal-edit") {
    state.modal = "edit-details";
    return render();
  }
  if (action === "estimate") {
    await generateForSelected("estimate", "Estimate generated and saved to this opportunity.");
    state.modal = "estimate";
    return render();
  }
  if (action === "site-check") {
    await generateForSelected("site_checklist", "Site visit checklist generated and saved.");
    state.modal = "site-check";
    return render();
  }
  if (action === "scope") {
    await generateForSelected("scope_of_work", "Scope of work generated and saved.");
    state.modal = "scope";
    return render();
  }
  if (["edit-details", "view-confidence", "account", "notifications", "templates", "integrations", "more-actions"].includes(action)) {
    state.modal = action === "more-actions" ? "more" : action;
    return render();
  }
  if (action === "save-estimate") {
    await persistStatus("estimating");
    addActivity(`Saved estimate range for ${selected().title}`);
    state.savedNotice = "Estimate saved to the opportunity.";
    state.modal = null;
    return render();
  }
  if (action === "complete-checklist") {
    addActivity(`Updated site visit checklist for ${selected().title}`);
    state.savedNotice = "Site visit checklist saved.";
    state.modal = null;
    return render();
  }
  if (action === "copy-scope") {
    const item = selected();
    const generated = state.generatedProducts[item.id]?.scope_of_work;
    navigator.clipboard?.writeText(generated?.body || `Scope of work for ${item.title}\n\n${scopeBullets(item).map((line) => `- ${line}`).join("\n")}`);
    addActivity(`Copied scope of work for ${item.title}`);
    state.savedNotice = "Scope copied and stored in activity history.";
    state.modal = null;
    return render();
  }
  if (action === "save-details") {
    const item = selected();
    item.contact = app.querySelector("#editContact")?.value || item.contact;
    item.email = app.querySelector("#editEmail")?.value || item.email;
    item.phone = app.querySelector("#editPhone")?.value || item.phone;
    const access = app.querySelector("#editAccess")?.value || "After hours";
    const accessRow = item.captured.find(([key]) => key.includes("access"));
    if (accessRow) accessRow[1] = access;
    else item.captured.push(["Site access requirements", access]);
    addActivity(`Updated extracted details for ${item.title}`);
    state.savedNotice = "Extracted details updated.";
    state.modal = null;
    return render();
  }
  if (action === "save-settings") {
    await persistSettings();
    state.modal = null;
    return render();
  }
  if (action === "connect-integration") {
    await persistIntegration(button.dataset.provider || "crm");
    state.modal = null;
    return render();
  }
  if (action === "sync-crm") {
    await persistSync("crm");
    state.modal = null;
    return render();
  }
}

async function saveEditedEmailDraft() {
  const item = selected();
  const generated = state.generatedProducts[item.id]?.follow_up_email;
  const draft = state.documentDrafts[item.id]?.follow_up_email;
  const body = app.querySelector("#emailDraft")?.value ?? draft?.body ?? generated?.body ?? emailText(item, state);
  const subject = draft?.subject || generated?.subject || "Quick follow-up on your data center project";
  state.aiActionLoading = "follow_up_email";
  state.aiError = "";
  state.savedNotice = "";
  render();
  try {
    const result = await saveInquiryDocument(item.id, {
      documentId: draft?.documentId || generated?.documentId,
      documentType: "follow_up_email",
      title: `Follow-up Email - ${item.title}`,
      subject,
      body,
      metadata: {
        confidenceScore: generated?.confidenceScore || item.confidence || 70,
        approvalRequired: false,
        missingRiskNotes: generated?.missingRiskNotes || item.missingFull || [],
        nextActions: ["Review/send follow-up email"]
      }
    });
    if (!state.generatedProducts[item.id]) state.generatedProducts[item.id] = {};
    state.generatedProducts[item.id].follow_up_email = productFromSavedDocument(result.document);
    if (state.documentDrafts[item.id]) delete state.documentDrafts[item.id].follow_up_email;
    addActivity(`Saved follow-up email v${result.document.currentVersion} for ${item.title}`);
    state.savedNotice = "Draft saved to Docs as a new version.";
    return result;
  } catch (error) {
    state.aiError = error.message;
    if (!state.documentDrafts[item.id]) state.documentDrafts[item.id] = {};
    state.documentDrafts[item.id].follow_up_email = {
      documentId: generated?.documentId,
      subject,
      body
    };
    state.savedNotice = "Draft kept locally because the worker API is unavailable.";
    addActivity(`Saved follow-up email draft locally for ${item.title}`);
    return null;
  } finally {
    state.aiActionLoading = "";
    render();
  }
}

async function persistStatus(status) {
  try {
    await updateInquiryStatus(selected().id, status);
    addActivity(`Updated ${selected().title} status to ${status}`);
  } catch {
    addActivity(`Updated ${selected().title} status locally to ${status}`);
  }
}

async function persistSettings() {
  const payload = {};
  app.querySelectorAll("[data-setting]").forEach((input) => {
    payload[input.dataset.setting] = input.checked;
  });
  try {
    const result = await saveSettings(payload);
    state.preferences = result.preferences;
    state.savedNotice = "Notification rules saved to D1.";
    addActivity("Updated notification rules");
  } catch (error) {
    state.preferences = { settings_json: JSON.stringify(payload) };
    state.savedNotice = "Notification rules saved locally because the worker API is unavailable.";
    state.aiError = error.message;
    addActivity("Updated notification rules locally");
  }
}

async function persistIntegration(provider) {
  try {
    const result = await connectIntegration(provider);
    state.integrations = state.integrations.filter((item) => item.provider !== provider);
    state.integrations.push(result.integration);
    state.savedNotice = `${result.integration.displayName || provider.toUpperCase()} integration connected.`;
    addActivity(`Connected ${provider.toUpperCase()} integration`);
  } catch (error) {
    state.aiError = error.message;
    state.savedNotice = `${provider.toUpperCase()} marked connected locally because the worker API is unavailable.`;
    state.integrations = state.integrations.filter((item) => item.provider !== provider);
    state.integrations.push({ provider, status: "connected" });
    addActivity(`Connected ${provider.toUpperCase()} locally`);
  }
}

async function persistSync(provider) {
  try {
    const result = await syncInquiry(selected().id, provider);
    state.savedNotice = `Synced to ${provider.toUpperCase()} as ${result.sync.externalId}.`;
    addActivity(`Synced ${selected().title} to ${provider.toUpperCase()}`);
  } catch (error) {
    state.aiError = error.message;
    state.savedNotice = `Sync queued locally because the worker API is unavailable.`;
    addActivity(`Queued ${selected().title} ${provider.toUpperCase()} sync locally`);
  }
}

function sourceChannelForTab(tab) {
  if (tab === "Email") return "email";
  if (tab === "Call Notes") return "phone";
  if (tab === "Photo") return "photo";
  return "manual";
}

function categoryForFile(file) {
  const name = `${file?.name || ""}`.toLowerCase();
  const type = `${file?.type || ""}`.toLowerCase();
  if (type.startsWith("image/")) return "photo";
  if (name.includes("floor") || name.includes("plan") || name.endsWith(".pdf")) return "floor_plan";
  if (name.includes("equipment") || name.includes("inventory") || name.endsWith(".csv") || name.endsWith(".xlsx")) return "equipment_list";
  return "other";
}

function inquiryFromApiRow(row) {
  const location = [row.city, row.region].filter(Boolean).join(", ") || "Location pending";
  return {
    id: row.id,
    company: row.company_name || "Unknown Company",
    title: row.title,
    service: serviceLabel(row.service_type),
    location,
    contact: row.contact_name || "Unknown Contact",
    phone: row.contact_phone || "(000) 000-0000",
    email: row.contact_email || "missing-email@customer.example",
    received: row.received_at ? "live" : "recently",
    last: row.received_at ? "live" : "recently",
    value: formatShortRange(row.estimated_low_cents, row.estimated_high_cents),
    range: formatRange(row.estimated_low_cents, row.estimated_high_cents),
    workload: capitalize(row.workload),
    priority: capitalize(row.priority === "urgent" ? "High" : row.priority),
    confidence: row.confidence_score || 0,
    missingCount: row.missing_count || 0,
    missing: row.missing_count ? [`${row.missing_count} open requirements`] : [],
    missingFull: row.missing_count ? [`${row.missing_count} open requirements`] : [],
    captured: row.lease_end_date ? [["Lease expiration date", row.lease_end_date]] : [],
    summary: "Live D1 opportunity loaded from the database. Open the record to refresh full extracted details, documents, and files.",
    next: row.missing_count ? "Send follow-up" : "Start estimate",
    ai: row.confidence_score > 82 ? "High" : "Medium"
  };
}

function inquiryFromDetail(detail) {
  const row = detail.inquiry;
  const fields = detail.fields || [];
  const missing = detail.missing || [];
  const summary = detail.summaries?.[0]?.body;
  const captured = fields.map((field) => [field.label, field.value_text]).filter(([, value]) => value);
  return {
    id: row.id,
    company: row.company_name || "Unknown Company",
    title: row.title,
    service: serviceLabel(row.service_type),
    location: [row.city, row.region].filter(Boolean).join(", ") || "Location pending",
    contact: row.contact_name || "Unknown Contact",
    phone: row.contact_phone || "(000) 000-0000",
    email: row.contact_email || "missing-email@customer.example",
    received: "live",
    last: "live",
    value: formatShortRange(row.estimated_low_cents, row.estimated_high_cents),
    range: formatRange(row.estimated_low_cents, row.estimated_high_cents),
    workload: capitalize(row.workload),
    priority: capitalize(row.priority === "urgent" ? "High" : row.priority),
    confidence: row.confidence_score || 0,
    missingCount: missing.filter((item) => ["open", "requested"].includes(item.status)).length,
    missing: missing.map((item) => item.label).slice(0, 3),
    missingFull: missing.map((item) => item.label),
    captured,
    summary: summary || "No AI summary has been generated yet.",
    next: missing.length ? "Send follow-up" : "Start estimate",
    ai: row.confidence_score > 82 ? "High" : "Medium"
  };
}

function publicFileFromApi(file) {
  return {
    id: file.id,
    fileName: file.file_name || file.fileName,
    contentType: file.content_type || file.contentType,
    sizeBytes: file.size_bytes || file.sizeBytes,
    category: file.category,
    url: `/api/files/${encodeURIComponent(file.id)}`
  };
}

function productFromDocument(document) {
  const metadata = parseJson(document.metadata_json);
  const documentType = document.document_type || document.documentType || "other";
  const product = {
    documentId: document.id,
    versionId: document.version_id,
    documentType,
    title: document.title,
    subject: document.subject || null,
    body: document.body || "",
    sections: sectionsFromBody(document.body),
    estimate: metadata.estimate || {},
    confidenceScore: metadata.confidenceScore || 70,
    approvalRequired: metadata.approvalRequired !== false,
    missingRiskNotes: metadata.missingRiskNotes || [],
    nextActions: metadata.nextActions || []
  };
  if (documentType === "proposal" && !product.estimate.lowCents) {
    product.estimate = { lowCents: selected().range ? null : null, highCents: null };
  }
  return product;
}

function productFromSavedDocument(document) {
  const metadata = document.metadata || {};
  return {
    documentId: document.documentId,
    versionId: document.versionId,
    documentType: document.documentType,
    title: document.title,
    subject: document.subject || null,
    body: document.body || "",
    sections: sectionsFromBody(document.body),
    estimate: metadata.estimate || {},
    confidenceScore: metadata.confidenceScore || 70,
    approvalRequired: metadata.approvalRequired !== false,
    missingRiskNotes: metadata.missingRiskNotes || [],
    nextActions: metadata.nextActions || [],
    currentVersion: document.currentVersion
  };
}

function sectionsFromBody(body) {
  const text = String(body || "").trim();
  if (!text) return [];
  return text.split(/\n{2,}/).slice(0, 8).map((chunk, index) => {
    const lines = chunk.split("\n");
    const maybeTitle = lines[0]?.trim();
    const hasTitle = maybeTitle && maybeTitle.length < 42 && !maybeTitle.endsWith(".");
    return {
      key: hasTitle ? maybeTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_") : `section_${index + 1}`,
      title: hasTitle ? maybeTitle : `Section ${index + 1}`,
      body: hasTitle ? lines.slice(1).join("\n").trim() || chunk : chunk
    };
  });
}

function parseJson(value) {
  if (!value) return {};
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return {};
  }
}

function serviceLabel(type) {
  return {
    data_center_decommissioning: "Data Center Decommissioning",
    lease_restoration: "Lease Restoration",
    cable_abatement: "Cable Abatement",
    hvac_removal: "HVAC Removal",
    electrical_decommissioning: "Electrical Decommissioning",
    asset_recovery: "Asset Recovery"
  }[type] || "Data Center Decommissioning";
}

function inquiryFromAnalysisResult(result) {
  const extraction = result.extraction;
  const location = [extraction.site.city, extraction.site.region].filter(Boolean).join(", ") || "Missing";
  const missingLabels = extraction.missingRequirements.map((item) => item.label);
  const captured = [
    ["Service", extraction.service.label],
    extraction.timeline.leaseEndDate ? ["Lease expiration date", extraction.timeline.leaseEndDate] : null,
    extraction.site.accessNotes ? ["Site access requirements", extraction.site.accessNotes] : null,
    extraction.equipment.assets.length ? ["Equipment", extraction.equipment.assets.join(", ")] : null
  ].filter(Boolean);
  return {
    id: result.id,
    company: extraction.company.name,
    title: `${extraction.company.name}${location !== "Missing" ? ` - ${location}` : ""}`,
    service: extraction.service.label,
    location,
    contact: extraction.contact.fullName,
    phone: extraction.contact.phone || "(000) 000-0000",
    email: extraction.contact.email || "missing-email@customer.example",
    received: "just now",
    last: "just now",
    value: formatShortRange(extraction.estimateRange.lowCents, extraction.estimateRange.highCents),
    range: formatRange(extraction.estimateRange.lowCents, extraction.estimateRange.highCents),
    workload: capitalize(extraction.workload),
    priority: capitalize(extraction.priority === "urgent" ? "High" : extraction.priority),
    confidence: extraction.confidenceScore,
    missingCount: missingLabels.length,
    missing: missingLabels.slice(0, 3),
    missingFull: missingLabels,
    captured,
    summary: extraction.summary,
    next: missingLabels.length ? "Send follow-up" : "Start estimate",
    ai: extraction.confidenceScore > 82 ? "High" : "Medium"
  };
}

function formatRange(low, high) {
  if (low == null || high == null) return "$0 - $0";
  return `$${Math.round(low / 100).toLocaleString()} - $${Math.round(high / 100).toLocaleString()}`;
}

function formatShortRange(low, high) {
  if (low == null || high == null) return "TBD";
  return `$${Math.round(low / 1000)}k-$${Math.round(high / 1000)}k`;
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

render();
hydrateFromApi();
