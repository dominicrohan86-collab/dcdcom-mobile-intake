CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`inquiry_id` text,
	`actor_user_id` text,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_activity_inquiry` ON `activity_events` (`inquiry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`inquiry_id` text,
	`run_type` text NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`model_name` text,
	`status` text NOT NULL,
	`input_preview` text,
	`output_json` text,
	`error_message` text,
	`latency_ms` integer,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ai_runs_account_type` ON `ai_runs` (`account_id`,`run_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_runs_inquiry` ON `ai_runs` (`inquiry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`summary_type` text NOT NULL,
	`body` text NOT NULL,
	`model_name` text,
	`confidence_score` integer,
	`generated_by_user_id` text,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`actor_user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`site_visit_id` text NOT NULL,
	`item_key` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_by_user_id` text,
	`completed_at` text,
	`notes` text,
	FOREIGN KEY (`site_visit_id`) REFERENCES `site_visits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_checklist_visit_key` ON `checklist_items` (`site_visit_id`,`item_key`);--> statement-breakpoint
CREATE TABLE `communication_delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`communication_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`attempt_number` integer DEFAULT 1 NOT NULL,
	`request_json` text DEFAULT '{}' NOT NULL,
	`response_json` text DEFAULT '{}' NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`communication_id`) REFERENCES `communications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_delivery_communication` ON `communication_delivery_attempts` (`communication_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `communications` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`contact_id` text,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'logged' NOT NULL,
	`external_message_id` text,
	`created_by_user_id` text,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_communications_inquiry` ON `communications` (`inquiry_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`industry` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_companies_account_name` ON `companies` (`account_id`,`name`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`company_id` text,
	`full_name` text NOT NULL,
	`title` text,
	`email` text,
	`phone` text,
	`preferred_channel` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_contacts_company` ON `contacts` (`company_id`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`generated_by_ai` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_document_versions` ON `document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`document_type` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_documents_inquiry_type` ON `documents` (`inquiry_id`,`document_type`,`status`);--> statement-breakpoint
CREATE TABLE `estimate_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`estimate_id` text NOT NULL,
	`line_type` text NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'each' NOT NULL,
	`unit_cost_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `estimates` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`low_cents` integer NOT NULL,
	`high_cents` integer NOT NULL,
	`target_margin_bps` integer,
	`assumptions` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`approved_at` text,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_estimates_inquiry_version` ON `estimates` (`inquiry_id`,`version`);--> statement-breakpoint
CREATE TABLE `extracted_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`field_key` text NOT NULL,
	`label` text NOT NULL,
	`value_text` text,
	`value_json` text,
	`confidence_score` integer DEFAULT 0 NOT NULL,
	`source_id` text,
	`is_verified` integer DEFAULT false NOT NULL,
	`verified_by_user_id` text,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `inquiry_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_extracted_inquiry_key` ON `extracted_fields` (`inquiry_id`,`field_key`);--> statement-breakpoint
CREATE INDEX `idx_extracted_inquiry` ON `extracted_fields` (`inquiry_id`,`field_key`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text,
	`site_id` text,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`size_bytes` integer,
	`category` text NOT NULL,
	`uploaded_by_user_id` text,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_files_inquiry` ON `files` (`inquiry_id`,`category`);--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`company_id` text,
	`contact_id` text,
	`site_id` text,
	`owner_user_id` text,
	`title` text NOT NULL,
	`service_type` text NOT NULL,
	`source_channel` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`workload` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`estimated_low_cents` integer,
	`estimated_high_cents` integer,
	`confidence_score` integer DEFAULT 0 NOT NULL,
	`lease_end_date` text,
	`requested_due_date` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_customer_activity_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_inquiries_account_status` ON `inquiries` (`account_id`,`status`,`priority`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_owner` ON `inquiries` (`owner_user_id`,`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_company` ON `inquiries` (`company_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `inquiry_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`sender` text,
	`raw_text` text NOT NULL,
	`external_message_id` text,
	`captured_by_user_id` text,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`captured_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`external_account_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integrations_account_provider_name` ON `integration_connections` (`account_id`,`provider`,`display_name`);--> statement-breakpoint
CREATE TABLE `missing_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`requirement_key` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`requested_at` text,
	`resolved_at` text,
	`notes` text,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_missing_inquiry_key` ON `missing_requirements` (`inquiry_id`,`requirement_key`);--> statement-breakpoint
CREATE INDEX `idx_missing_inquiry_status` ON `missing_requirements` (`inquiry_id`,`status`,`severity`);--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text,
	`rule_key` text NOT NULL,
	`label` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`conditions_json` text DEFAULT '{}' NOT NULL,
	`channels_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_rules` ON `notification_rules` (`account_id`,`user_id`,`rule_key`);--> statement-breakpoint
CREATE TABLE `proposal_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`section_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`display_order` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_proposal_sections` ON `proposal_sections` (`proposal_id`,`section_key`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`estimate_id` text,
	`document_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`price_low_cents` integer,
	`price_high_cents` integer,
	`requires_approval` integer DEFAULT true NOT NULL,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`site_id` text,
	`scheduled_start` text,
	`scheduled_end` text,
	`status` text DEFAULT 'needed' NOT NULL,
	`assigned_user_id` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`company_id` text,
	`name` text NOT NULL,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`region` text,
	`postal_code` text,
	`country` text DEFAULT 'US' NOT NULL,
	`timezone` text,
	`site_type` text,
	`access_notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_sites_company` ON `sites` (`company_id`);--> statement-breakpoint
CREATE TABLE `sync_events` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`inquiry_id` text,
	`status` text NOT NULL,
	`operation` text NOT NULL,
	`external_id` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_view` text DEFAULT 'today' NOT NULL,
	`notification_digest` text DEFAULT 'daily' NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`avatar_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_account` ON `users` (`account_id`);