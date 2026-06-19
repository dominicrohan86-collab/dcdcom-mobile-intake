export type UserRole = "admin" | "estimator" | "project_manager" | "sales" | "viewer";
export type SourceChannel = "email" | "phone" | "text" | "manual" | "photo" | "web";
export type InquiryStatus = "new" | "needs_info" | "estimating" | "site_visit" | "proposal" | "review" | "won" | "lost" | "archived";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Workload = "low" | "medium" | "high";
export type ServiceType =
  | "data_center_decommissioning"
  | "lease_restoration"
  | "cable_abatement"
  | "hvac_removal"
  | "electrical_decommissioning"
  | "asset_recovery"
  | "other";

export interface Account {
  id: string;
  name: string;
  domain?: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  account_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string | null;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  account_id: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  company_id?: string | null;
  full_name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  preferred_channel?: "email" | "phone" | "text" | "unknown" | null;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: string;
  account_id: string;
  company_id?: string | null;
  name: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country: string;
  timezone?: string | null;
  site_type?: "data_center" | "office" | "warehouse" | "mixed" | "unknown" | null;
  access_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Inquiry {
  id: string;
  account_id: string;
  company_id?: string | null;
  contact_id?: string | null;
  site_id?: string | null;
  owner_user_id?: string | null;
  title: string;
  service_type: ServiceType;
  source_channel: SourceChannel;
  priority: Priority;
  workload: Workload;
  status: InquiryStatus;
  estimated_low_cents?: number | null;
  estimated_high_cents?: number | null;
  confidence_score: number;
  lease_end_date?: string | null;
  requested_due_date?: string | null;
  received_at: string;
  last_customer_activity_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquirySource {
  id: string;
  inquiry_id: string;
  channel: SourceChannel;
  subject?: string | null;
  sender?: string | null;
  raw_text: string;
  external_message_id?: string | null;
  captured_by_user_id?: string | null;
  captured_at: string;
}

export interface ExtractedField {
  id: string;
  inquiry_id: string;
  field_key: string;
  label: string;
  value_text?: string | null;
  value_json?: string | null;
  confidence_score: number;
  source_id?: string | null;
  is_verified: 0 | 1;
  verified_by_user_id?: string | null;
  verified_at?: string | null;
  created_at: string;
}

export interface MissingRequirement {
  id: string;
  inquiry_id: string;
  requirement_key: string;
  label: string;
  category: "scope" | "timeline" | "access" | "equipment" | "commercial" | "safety" | "documentation";
  severity: "low" | "medium" | "high" | "blocking";
  status: "open" | "requested" | "received" | "waived";
  requested_at?: string | null;
  resolved_at?: string | null;
  notes?: string | null;
}

export interface AiSummary {
  id: string;
  inquiry_id: string;
  summary_type: "intake" | "email" | "proposal" | "confidence" | "scope";
  body: string;
  model_name?: string | null;
  confidence_score?: number | null;
  generated_by_user_id?: string | null;
  generated_at: string;
}

export interface AiRun {
  id: string;
  account_id: string;
  inquiry_id?: string | null;
  run_type: "intake_extraction" | "follow_up_email" | "proposal" | "scope" | "site_checklist" | "estimate" | "confidence";
  provider: "openai" | string;
  model_name?: string | null;
  status: "success" | "fallback" | "failed";
  input_preview?: string | null;
  output_json?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  created_by_user_id?: string | null;
  created_at: string;
}

export interface Estimate {
  id: string;
  inquiry_id: string;
  version: number;
  status: "draft" | "approved" | "sent" | "superseded";
  low_cents: number;
  high_cents: number;
  target_margin_bps?: number | null;
  assumptions?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  approved_at?: string | null;
}

export interface SiteVisit {
  id: string;
  inquiry_id: string;
  site_id?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status: "needed" | "scheduled" | "complete" | "cancelled";
  assigned_user_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  inquiry_id: string;
  document_type: "follow_up_email" | "proposal" | "scope_of_work" | "site_checklist" | "estimate" | "closeout" | "other";
  title: string;
  status: "draft" | "review" | "approved" | "sent" | "archived";
  current_version: number;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  inquiry_id: string;
  estimate_id?: string | null;
  document_id?: string | null;
  status: "draft" | "review" | "approved" | "sent" | "accepted" | "rejected";
  price_low_cents?: number | null;
  price_high_cents?: number | null;
  requires_approval: 0 | 1;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Communication {
  id: string;
  inquiry_id: string;
  contact_id?: string | null;
  direction: "inbound" | "outbound";
  channel: "email" | "phone" | "text" | "internal_note";
  subject?: string | null;
  body: string;
  status: "draft" | "queued" | "sent" | "received" | "logged" | "failed";
  external_message_id?: string | null;
  created_by_user_id?: string | null;
  occurred_at: string;
}

export interface CommunicationDeliveryAttempt {
  id: string;
  communication_id: string;
  provider: string;
  status: "queued" | "sent" | "failed";
  attempt_number: number;
  request_json: string;
  response_json: string;
  error_message?: string | null;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  account_id: string;
  inquiry_id?: string | null;
  actor_user_id?: string | null;
  event_type: string;
  summary: string;
  metadata_json: string;
  created_at: string;
}
