import { pipelineCard, shell } from "../components.js";

export function pipelineScreen({ state, inquiries }) {
  const filters = ["New", "Needs Info", "Estimating", "Proposal"];
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = inquiries.filter((item) => {
    const matchesSearch = !query || `${item.title} ${item.service} ${item.location}`.toLowerCase().includes(query);
    const matchesFilter = state.pipelineFilter === "New"
      || (state.pipelineFilter === "Needs Info" && item.missingCount > 0)
      || (state.pipelineFilter === "Estimating" && item.confidence >= 75)
      || (state.pipelineFilter === "Proposal" && item.confidence >= 80);
    return matchesSearch && matchesFilter;
  });

  return shell(`
    <h2 class="page-title">Pipeline</h2>
    <label class="search-box">${""}<input id="pipelineSearch" value="${state.searchQuery}" placeholder="Search customer, location, or service"/></label>
    <div class="tabs">
      ${filters.map((filter) => `<button class="${state.pipelineFilter === filter ? "active" : ""}" data-pipeline-filter="${filter}">${filter} <b>${countFor(filter, inquiries)}</b></button>`).join("")}
    </div>
    <div class="pipeline-list">${filtered.length ? filtered.map(pipelineCard).join("") : `<div class="empty-compact">No matching inquiries.</div>`}</div>
  `, state);
}

function countFor(filter, inquiries) {
  if (filter === "New") return inquiries.length;
  if (filter === "Needs Info") return inquiries.filter((item) => item.missingCount > 0).length;
  if (filter === "Estimating") return inquiries.filter((item) => item.confidence >= 75).length;
  return inquiries.filter((item) => item.confidence >= 80).length;
}
