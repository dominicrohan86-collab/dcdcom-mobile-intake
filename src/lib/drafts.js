export function emailText(item, state) {
  const greeting = state.tone === "Warm" ? "Hi Michael," : "Hi Michael,";
  const close = state.tone === "Formal" ? "Sincerely,\nDCDcom Team" : "Best regards,\nDCDcom Team";
  const extra = state.draftVersion % 2 ? "\n\nIf helpful, we can also provide a simple checklist before the site walk." : "";
  const lines = [];

  if (state.includeOptions.overview) lines.push(`Thank you for reaching out regarding the decommissioning of your data center space in ${item.location.split(",")[0]}.`);
  if (state.includeOptions.missing) {
    lines.push(`To provide an accurate scope and estimate, could you please confirm a few details?
  - Square footage or suite size
  - Number of racks / cabinets
  - Equipment inventory if available
  - Preferred timeline or lease end date
  - Access requirements or restrictions`);
  }
  if (state.includeOptions.timeline) lines.push("If there is a hard lease date or preferred completion window, we can use that to sequence labor and equipment removal.");
  if (state.includeOptions.photos) lines.push("We would also appreciate any photos, drawings, floor plans, or equipment lists from the site that you can share.");
  if (state.includeOptions.budget) lines.push("If you already have a budget range or approval threshold, we can align the proposal format to that process.");
  if (state.includeOptions.visit) lines.push(`Happy to schedule a quick site visit as well.${extra}`);

  return `${greeting}
${lines.join("\n\n")}

${close}`;
}
