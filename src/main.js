import { emailText } from "./lib/drafts.js";
import { extractFromText } from "./lib/extraction.js";
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

function addOpportunity() {
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
      setScreen(button.dataset.screen, { savedNotice: "" }, { push: true });
    });
  });

  app.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      setScreen("detail", { selectedId: el.dataset.open, savedNotice: "", expandedSummary: false }, { push: true });
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
      render();
      const nextInput = app.querySelector("#inquiryText");
      nextInput.focus();
      nextInput.selectionStart = nextInput.selectionEnd = state.inputText.length;
    });
  }

  app.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleAction(button);
    });
  });
}

function handleAction(button) {
  const action = button.dataset.action;
  if (button.dataset.id) state.selectedId = button.dataset.id;
  if (action === "back") return goBack();
  if (action === "close-modal") {
    state.modal = null;
    return render();
  }
  if (action === "save-opportunity") return addOpportunity();
  if (action === "generate-questions") {
    const missing = extractFromText(state.inputText).rows.find((row) => row.label === "Missing Info").value;
    state.savedNotice = missing === "None" ? "No missing questions detected. Opportunity is ready for estimating." : `Questions generated for: ${missing}.`;
    addActivity(`Generated follow-up questions for ${missing === "None" ? "complete inquiry" : missing}`);
    return render();
  }
  if (action === "toggle-edit") return setScreen("email", { emailEditable: !state.emailEditable });
  if (action === "regenerate") {
    addActivity(`Regenerated follow-up email for ${selected().title}`);
    return setScreen("email", { draftVersion: state.draftVersion + 1, savedNotice: "Draft regenerated from current missing fields." });
  }
  if (action === "save-draft") {
    addActivity(`Saved follow-up email draft for ${selected().title}`);
    return setScreen("email", { savedNotice: "Draft saved to Docs and linked to this opportunity." });
  }
  if (action === "copy") {
    navigator.clipboard?.writeText(emailText(selected(), state));
    state.savedNotice = "Draft copied to clipboard.";
    addActivity(`Copied email draft for ${selected().title}`);
    return render();
  }
  if (action === "proposal-regenerate") {
    addActivity(`Regenerated proposal draft for ${selected().title}`);
    return setScreen("proposal", { savedNotice: "Proposal draft regenerated with the latest scope assumptions." });
  }
  if (action === "send-review") {
    addActivity(`Sent ${selected().title} proposal to review`);
    return setScreen("proposal", { savedNotice: "Sent to internal review queue." });
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
  if (["estimate", "site-check", "scope", "edit-details", "view-confidence", "account", "notifications", "templates", "integrations", "more-actions"].includes(action)) {
    state.modal = action === "more-actions" ? "more" : action;
    return render();
  }
  if (action === "save-estimate") {
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
    navigator.clipboard?.writeText(`Scope of work for ${selected().title}\n\n${scopeBullets(selected()).map((line) => `- ${line}`).join("\n")}`);
    addActivity(`Copied scope of work for ${selected().title}`);
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
  if (["save-settings", "connect-integration", "sync-crm"].includes(action)) {
    addActivity(`${button.textContent.trim()} completed`);
    state.savedNotice = `${button.textContent.trim()} completed.`;
    state.modal = null;
    return render();
  }
}

render();
