import { avatar, icon, logo } from "../lib/icons.js";

export function badge(text, type = "") {
  return `<span class="badge ${String(type).toLowerCase()}">${text}</span>`;
}

export function metric(iconName, value, label, color = "") {
  return `<div class="metric ${color}">${icon(iconName)}<strong>${value}</strong><span>${label}</span></div>`;
}

export function shell(content, state, options = {}) {
  const title = options.title || "";
  return `
    <div class="status-bar"><b>9:41</b><div class="dynamic-island"></div><div class="status-icons"><span></span><span></span><span></span></div></div>
    <header class="topbar ${options.compact ? "compact" : ""}">
      <div class="top-left">${options.back ? `<button class="back-btn" data-action="back" aria-label="Back">&larr;</button>` : `<div class="brand">${logo()}</div>`}</div>
      ${title ? `<h1 class="top-title">${title}</h1>` : `<div class="top-spacer"></div>`}
      <div class="top-actions">${options.actions || avatar()}</div>
    </header>
    <div class="screen ${options.padBottom === false ? "" : "with-nav"}">${content}</div>
    ${options.nav === false ? "" : bottomNav(state)}
  `;
}

function bottomNav(state) {
  const items = [
    ["today", "home", "Today"],
    ["pipeline", "briefcase", "Inquiries"],
    ["add", "plus", ""],
    ["docs", "file", "Docs"],
    ["more", "more", "More"]
  ];
  return `<nav class="bottom-nav">${items.map(([target, ic, label]) => {
    const active = state.screen === target || (target === "today" && ["detail", "email", "proposal"].includes(state.screen));
    if (target === "add") return `<button class="fab" data-screen="add" aria-label="Add inquiry">${icon(ic)}</button>`;
    return `<button class="${active ? "active" : ""}" data-screen="${target}">${icon(ic)}<span>${label}</span></button>`;
  }).join("")}</nav>`;
}

export function queueCard(item, index) {
  const actionIcon = index === 0 || index === 3 ? "phone" : "mail";
  const actionLabel = actionIcon === "phone" ? "Call" : "Email";
  return `
    <article class="queue-card stripe-${item.priority.toLowerCase()}" data-open="${item.id}">
      <div class="building-bubble">${icon("building")}</div>
      <div class="queue-main">
        <div class="queue-top">
          <div><h4>${item.company}</h4><p>${item.service}</p><p class="muted">${icon("pin")} ${item.location}</p></div>
          ${badge(item.workload, item.workload)}
        </div>
        <div class="queue-actions">
          <span class="missing-pill">${icon("alert")} ${item.missingCount} Missing</span>
          <button data-action="${actionIcon}" data-id="${item.id}">${icon(actionIcon)} ${actionLabel}</button>
          <button class="review" data-open="${item.id}">Review</button>
        </div>
      </div>
    </article>
  `;
}

export function pipelineCard(item) {
  return `
    <article class="pipeline-card stripe-${item.priority.toLowerCase()}" data-open="${item.id}">
      <div>
        <h4>${item.title}</h4>
        <p>${item.service}</p>
        <span>Received ${item.received}</span>
      </div>
      <div class="pipe-side">
        ${badge(item.workload, item.workload)}
        <strong>${item.value}</strong>
        <span>Potential</span>
      </div>
      <button class="chev" data-open="${item.id}" aria-label="Open">›</button>
    </article>
  `;
}
