import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const stageLabels = {
  new: "New",
  needs_info: "Needs Info",
  estimating: "Estimating",
  site_visit: "Site Visit",
  proposal: "Proposal",
  review: "In Review",
  won: "Won",
  lost: "Lost",
  archived: "Archived"
};

export const stageOptions = Object.entries(stageLabels).filter(([value]) => value !== "archived");
export const stageTones = { new: "slate", needs_info: "amber", estimating: "cyan", site_visit: "indigo", proposal: "blue", review: "orange", won: "green", lost: "red", archived: "slate" };
export const priorityTones = { urgent: "red", high: "orange", medium: "blue", low: "slate" };
export const requirementTones = { open: "slate", requested: "blue", received: "green", waived: "neutral" };
export const communicationTones = { draft: "slate", queued: "amber", sent: "green", received: "cyan", logged: "slate", failed: "red" };

export function moneyRange(low, high) {
  if (low == null || high == null) return "TBD";
  return `$${Math.round(low / 100).toLocaleString()} - $${Math.round(high / 100).toLocaleString()}`;
}

export function shortRange(low, high) {
  if (low == null || high == null) return "TBD";
  return `$${Math.round(low / 100000)}k-$${Math.round(high / 100000)}k`;
}

export function serviceLabel(value) {
  return String(value || "Data Center Decommissioning")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function priorityLabel(value) {
  return value === "urgent" ? "High" : serviceLabel(value || "medium");
}

export function adaptInquiry(row) {
  return {
    ...row,
    company: row.company_name || row.company || "Unknown Company",
    contact: row.contact_name || row.contact || "Unknown Contact",
    email: row.contact_email || row.email || "",
    phone: row.contact_phone || row.phone || "",
    location: [row.city, row.region].filter(Boolean).join(", ") || row.location || "Location pending",
    service: row.service || serviceLabel(row.service_type),
    priorityLabel: priorityLabel(row.priority),
    workloadLabel: serviceLabel(row.workload || "medium"),
    missingCount: Number(row.missing_count ?? row.missingCount ?? 0),
    confidence: Number(row.confidence_score ?? row.confidence ?? 0),
    value: row.value || shortRange(row.estimated_low_cents, row.estimated_high_cents)
  };
}
