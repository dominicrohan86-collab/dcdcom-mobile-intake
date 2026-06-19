INSERT OR IGNORE INTO accounts (id, name, domain)
VALUES ('acct_dcdcom', 'DCDcom', 'dcdcom.com');

INSERT OR IGNORE INTO users (id, account_id, email, full_name, role)
VALUES ('user_alex', 'acct_dcdcom', 'alex@dcdcom.com', 'Alex Morgan', 'project_manager');

INSERT OR IGNORE INTO user_preferences (user_id, default_view, notification_digest, timezone)
VALUES ('user_alex', 'today', 'daily', 'America/New_York');

INSERT OR IGNORE INTO companies (id, account_id, name, website, industry)
VALUES
  ('co_ntt', 'acct_dcdcom', 'NTT Data', 'https://www.nttdata.com', 'Data Centers'),
  ('co_cushman', 'acct_dcdcom', 'Cushman & Wakefield', 'https://www.cushmanwakefield.com', 'Commercial Real Estate'),
  ('co_digital', 'acct_dcdcom', 'Digital Realty', 'https://www.digitalrealty.com', 'Data Centers');

INSERT OR IGNORE INTO contacts (id, account_id, company_id, full_name, title, email, phone, preferred_channel)
VALUES
  ('ct_michael', 'acct_dcdcom', 'co_ntt', 'Michael Reynolds', 'Facilities Director', 'mreynolds@nttdata.com', '(571) 555-0134', 'email'),
  ('ct_priya', 'acct_dcdcom', 'co_cushman', 'Priya Shah', 'Property Manager', 'priya.shah@cw.example', '(202) 555-0178', 'email'),
  ('ct_mei', 'acct_dcdcom', 'co_digital', 'Mei Ortiz', 'Operations Lead', 'mei.ortiz@digitalrealty.example', '(602) 555-0199', 'phone');

INSERT OR IGNORE INTO sites (id, account_id, company_id, name, city, region, country, site_type, access_notes)
VALUES
  ('site_ashburn', 'acct_dcdcom', 'co_ntt', 'Ashburn Data Center', 'Ashburn', 'VA', 'US', 'data_center', 'After hours'),
  ('site_dc', 'acct_dcdcom', 'co_cushman', 'Washington Lease Office', 'Washington', 'DC', 'US', 'office', 'Business hours'),
  ('site_phoenix', 'acct_dcdcom', 'co_digital', 'Phoenix Data Center', 'Phoenix', 'AZ', 'US', 'data_center', 'Access window pending');

INSERT OR IGNORE INTO inquiries (
  id, account_id, company_id, contact_id, site_id, owner_user_id, title, service_type,
  source_channel, priority, workload, status, estimated_low_cents, estimated_high_cents,
  confidence_score, lease_end_date, received_at, last_customer_activity_at
)
VALUES
  ('inq_ntt_ashburn', 'acct_dcdcom', 'co_ntt', 'ct_michael', 'site_ashburn', 'user_alex',
   'NTT Data - Ashburn, VA', 'data_center_decommissioning', 'phone', 'high', 'medium', 'needs_info',
   2850000, 4500000, 78, '2025-07-31', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('inq_cushman_dc', 'acct_dcdcom', 'co_cushman', 'ct_priya', 'site_dc', 'user_alex',
   'Cushman & Wakefield', 'cable_abatement', 'email', 'medium', 'low', 'needs_info',
   800000, 1400000, 68, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('inq_digital_phx', 'acct_dcdcom', 'co_digital', 'ct_mei', 'site_phoenix', 'user_alex',
   'Digital Realty - Phoenix, AZ', 'electrical_decommissioning', 'text', 'medium', 'low', 'estimating',
   1200000, 2000000, 84, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO inquiry_sources (id, inquiry_id, channel, subject, sender, raw_text, captured_by_user_id)
VALUES
  ('src_ntt_call', 'inq_ntt_ashburn', 'phone', 'Call notes', 'Michael Reynolds', 'Customer requested data center decommissioning in Ashburn with rack removal, cable abatement, HVAC removal, and site cleanup.', 'user_alex'),
  ('src_cushman_email', 'inq_cushman_dc', 'email', 'Cable removal request', 'Priya Shah', 'Need cable removed before lease restoration. Need estimate and details on ceiling height.', 'user_alex'),
  ('src_digital_text', 'inq_digital_phx', 'text', 'Electrical scope', 'Mei Ortiz', 'Electrical decommissioning request for Phoenix site. Need access hours and load schedule.', 'user_alex');

INSERT OR IGNORE INTO missing_requirements (id, inquiry_id, requirement_key, label, category, severity, status)
VALUES
  ('miss_ntt_sqft', 'inq_ntt_ashburn', 'square_footage', 'Square footage / suite size', 'scope', 'high', 'open'),
  ('miss_ntt_racks', 'inq_ntt_ashburn', 'rack_count', 'Number of racks / cabinets', 'equipment', 'high', 'open'),
  ('miss_ntt_photos', 'inq_ntt_ashburn', 'site_photos', 'Photos or docs from site', 'documentation', 'medium', 'open'),
  ('miss_cushman_height', 'inq_cushman_dc', 'ceiling_height', 'Ceiling height', 'scope', 'medium', 'open'),
  ('miss_cushman_volume', 'inq_cushman_dc', 'cable_volume', 'Cable volume', 'scope', 'high', 'open'),
  ('miss_digital_loads', 'inq_digital_phx', 'electrical_loads', 'Electrical loads', 'scope', 'high', 'open');

INSERT OR IGNORE INTO ai_summaries (id, inquiry_id, summary_type, body, model_name, confidence_score, generated_by_user_id)
VALUES
  ('sum_ntt_intake', 'inq_ntt_ashburn', 'intake', 'Client is requesting decommissioning of a data center suite. Timeline appears urgent and key details are missing on equipment and access.', 'mock-extractor-v1', 78, 'user_alex'),
  ('sum_cushman_intake', 'inq_cushman_dc', 'intake', 'Property manager needs cable removed before lease restoration. Field quantities and ceiling access are unclear.', 'mock-extractor-v1', 68, 'user_alex'),
  ('sum_digital_intake', 'inq_digital_phx', 'intake', 'Electrical-only decommissioning request with basic site and service details. Load schedule and access window are still needed.', 'mock-extractor-v1', 84, 'user_alex');

INSERT OR IGNORE INTO activity_events (id, account_id, inquiry_id, actor_user_id, event_type, summary)
VALUES
  ('evt_ntt_seed', 'acct_dcdcom', 'inq_ntt_ashburn', 'user_alex', 'inquiry.seeded', 'Seeded NTT Data inquiry for demo workspace'),
  ('evt_cushman_seed', 'acct_dcdcom', 'inq_cushman_dc', 'user_alex', 'inquiry.seeded', 'Seeded Cushman & Wakefield inquiry for demo workspace'),
  ('evt_digital_seed', 'acct_dcdcom', 'inq_digital_phx', 'user_alex', 'inquiry.seeded', 'Seeded Digital Realty inquiry for demo workspace');
