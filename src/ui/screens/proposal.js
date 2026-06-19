import { icon } from "../../lib/icons.js";
import { shell } from "../components.js";

export function proposalScreen({ state, selected }) {
  const item = selected();
  const generated = state.generatedProducts[item.id]?.proposal;
  const tabs = ["Scope", "Assumptions", "Deliverables", "Terms"];
  const generatedSection = (tab) => generated?.sections?.find((section) => section.title.toLowerCase().includes(tab.toLowerCase()) || section.key === tab.toLowerCase());
  const body = generated ? Object.fromEntries(tabs.map((tab) => {
    const section = generatedSection(tab);
    return [tab, renderText(section?.body || generated.body)];
  })) : {
    Scope: `<p>Provide turnkey decommissioning of customer data center environment including equipment removal, cable management, asset recovery, and site cleanup in accordance with lease restoration requirements.</p>
      <ul class="green-list"><li>Remove and recycle IT equipment and racks</li><li>Cable abatement and recycling</li><li>Electrical disconnect and removal</li><li>HVAC decommissioning</li><li>Site cleanup and lease restoration</li></ul>`,
    Assumptions: `<p>Estimate assumes normal business access, available loading dock, customer-provided asset list, and no hazardous materials outside typical data center equipment.</p>`,
    Deliverables: `<p>Closeout report, serialized asset recovery list, recycling documentation, site photos, and completion certification.</p>`,
    Terms: `<p>Pricing is valid for 30 days. Work begins after written approval, site walk confirmation, and receipt of customer access requirements.</p>`
  };
  const busy = state.aiActionLoading === "proposal";
  const confidence = generated?.confidenceScore || item.confidence || 78;

  return shell(`
    <article class="proposal-card">
      <div class="proposal-meta">DRAFT <span>AI Generated</span><span>May 16, 2025</span></div>
      <div class="proposal-head"><div><h3>${generated?.title || item.title}</h3><p>${item.service}</p></div><div><strong>${generated?.estimate?.lowCents ? priceRange(generated.estimate.lowCents, generated.estimate.highCents) : item.range}</strong><span>Price Range</span></div></div>
      <div class="proposal-tabs">${tabs.map((tab) => `<button class="${state.proposalTab === tab ? "active" : ""}" data-proposal-tab="${tab}">${tab}</button>`).join("")}</div>
      <div class="proposal-body">${body[state.proposalTab]}</div>
      <div class="approval">${icon("alert")}<div><b>${generated?.approvalRequired === false ? "Ready for Draft Review" : "Approval Required"}</b><span>${generated?.missingRiskNotes?.[0] || "Review and approve content before sending."}</span></div></div>
      <div class="ai-score"><div class="score-ring">${confidence}%</div><div><h3>AI Confidence</h3><b>${confidence > 82 ? "High confidence" : "Medium confidence"}</b><p>${generated?.nextActions?.[0] || "Based on extracted data points and similar past projects."}</p></div></div>
    </article>
    <div class="bottom-actions">
      <button class="secondary" data-action="proposal-edit">Edit</button>
      <button class="secondary" data-action="proposal-regenerate" ${busy ? "disabled" : ""}>${icon("refresh")} ${busy ? "Generating..." : "Regenerate"}</button>
      <button class="primary wide" data-action="send-review" ${busy ? "disabled" : ""}>${busy ? "Sending..." : "Send for Review"}</button>
    </div>
    ${state.aiError ? `<p class="notice warning">${state.aiError}</p>` : ""}
    ${state.savedNotice ? `<p class="notice">${state.savedNotice}</p>` : ""}
  `, state, { title: "Proposal Draft", back: true, nav: false, actions: `<button class="dots" data-action="more-actions" aria-label="More actions">${icon("more")}</button>` });
}

function renderText(text) {
  return String(text || "").split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}

function priceRange(low, high) {
  return `$${Math.round(low / 100).toLocaleString()} - $${Math.round(high / 100).toLocaleString()}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
