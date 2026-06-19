export function estimateFor(item) {
  const low = Number(item.range.match(/\$?([\d,]+)/)?.[1].replace(",", "") || 25000);
  const high = Number(item.range.match(/-\s*\$?([\d,]+)/)?.[1].replace(",", "") || 45000);
  return {
    labor: Math.round(low * 0.42),
    logistics: Math.round(low * 0.18),
    recycling: Math.round(low * 0.16),
    contingency: Math.round(low * 0.1),
    low,
    high,
    margin: item.workload === "High" ? "31%" : item.workload === "Low" ? "38%" : "34%"
  };
}

export function scopeBullets(item) {
  return [
    `Perform turnkey ${item.service.toLowerCase()} at ${item.location}.`,
    "Remove, sort, palletize, and recycle decommissioned racks, cable, and equipment.",
    "Coordinate site access, loading path, insurance documentation, and customer security requirements.",
    "Provide completion photos, recycling documentation, and closeout notes."
  ];
}

export function confidenceBreakdown(item) {
  return [
    ["Contact and company", "Complete", 100],
    ["Service category", "Complete", 96],
    ["Location", "Complete", 92],
    ["Timeline", item.captured.some(([key]) => key.toLowerCase().includes("lease")) ? "Partial" : "Missing", 72],
    ["Equipment inventory", item.missing.join(" ").includes("rack") ? "Missing" : "Partial", 58],
    ["Access and restrictions", item.missing.join(" ").includes("access") ? "Missing" : "Partial", 54]
  ];
}
