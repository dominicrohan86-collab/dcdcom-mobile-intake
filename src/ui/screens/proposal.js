import { icon } from "../../lib/icons.js";
import { shell } from "../components.js";

export function proposalScreen({ state, selected }) {
  const item = selected();
  const tabs = ["Scope", "Assumptions", "Deliverables", "Terms"];
  const body = {
    Scope: `<p>Provide turnkey decommissioning of customer data center environment including equipment removal, cable management, asset recovery, and site cleanup in accordance with lease restoration requirements.</p>
      <ul class="green-list"><li>Remove and recycle IT equipment and racks</li><li>Cable abatement and recycling</li><li>Electrical disconnect and removal</li><li>HVAC decommissioning</li><li>Site cleanup and lease restoration</li></ul>`,
    Assumptions: `<p>Estimate assumes normal business access, available loading dock, customer-provided asset list, and no hazardous materials outside typical data center equipment.</p>`,
    Deliverables: `<p>Closeout report, serialized asset recovery list, recycling documentation, site photos, and completion certification.</p>`,
    Terms: `<p>Pricing is valid for 30 days. Work begins after written approval, site walk confirmation, and receipt of customer access requirements.</p>`
  };

  return shell(`
    <article class="proposal-card">
      <div class="proposal-meta">DRAFT <span>AI Generated</span><span>May 16, 2025</span></div>
      <div class="proposal-head"><div><h3>${item.title}</h3><p>${item.service}</p></div><div><strong>${item.range}</strong><span>Price Range</span></div></div>
      <div class="proposal-tabs">${tabs.map((tab) => `<button class="${state.proposalTab === tab ? "active" : ""}" data-proposal-tab="${tab}">${tab}</button>`).join("")}</div>
      <div class="proposal-body">${body[state.proposalTab]}</div>
      <div class="approval">${icon("alert")}<div><b>Approval Required</b><span>Review and approve content before sending.</span></div></div>
      <div class="ai-score"><div class="score-ring">78%</div><div><h3>AI Confidence</h3><b>High confidence</b><p>Based on 18 extracted data points and similar past projects.</p></div></div>
    </article>
    <div class="bottom-actions">
      <button class="secondary" data-action="proposal-edit">Edit</button>
      <button class="secondary" data-action="proposal-regenerate">${icon("refresh")} Regenerate</button>
      <button class="primary wide" data-action="send-review">Send for Review</button>
    </div>
    ${state.savedNotice ? `<p class="notice">${state.savedNotice}</p>` : ""}
  `, state, { title: "Proposal Draft", back: true, nav: false, actions: `<button class="dots" data-action="more-actions" aria-label="More actions">${icon("more")}</button>` });
}
