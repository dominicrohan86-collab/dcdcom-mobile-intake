export function extractFromText(text) {
  const lower = text.toLowerCase();
  const company = /ntt data/i.test(text) ? "NTT Data" : /cushman/i.test(text) ? "Cushman & Wakefield" : /digital realty/i.test(text) ? "Digital Realty" : "Unknown Company";
  const contact = /tom/i.test(text) ? "Tom" : /michael/i.test(text) ? "Michael" : "Not provided";
  const location = /ashburn/i.test(text) ? "Ashburn, VA" : /phoenix/i.test(text) ? "Phoenix, AZ" : /washington|dc/i.test(text) ? "Washington, DC" : "Missing";
  const service = lower.includes("hvac") && !lower.includes("data center") ? "HVAC Removal" : lower.includes("cable") && !lower.includes("data center") ? "Cable Abatement" : "Data Center Decommissioning";
  const timeline = /july 15|jul 15/i.test(text) ? "Lease end Jul 15" : /july 31|jul 31/i.test(text) ? "Lease end Jul 31" : "Missing";
  const equipment = /40 racks/i.test(text) ? "~40 Racks, HVAC Units, Cable" : lower.includes("rack") ? "Racks mentioned" : "Missing";
  const missing = [];
  if (!/access|after hours|business hours/i.test(text)) missing.push("access hours");
  if (!/utility|disconnect|shutoff/i.test(text)) missing.push("utility shutoff");
  if (!/floor plan|drawing|plan/i.test(text)) missing.push("floor plan");
  if (!/data destruction|drive|media/i.test(text)) missing.push("data destruction");
  const confidence = Math.max(54, 94 - missing.length * 4 - (company === "Unknown Company" ? 12 : 0));

  return {
    confidence,
    rows: [
      { icon: "user", label: "Contact", value: contact },
      { icon: "pin", label: "Location", value: location },
      { icon: "briefcase", label: "Service", value: service },
      { icon: "calendar", label: "Timeline", value: timeline },
      { icon: "building", label: "Equipment", value: equipment },
      { icon: "alert", label: "Missing Info", value: missing.join(", ") || "None" }
    ]
  };
}
