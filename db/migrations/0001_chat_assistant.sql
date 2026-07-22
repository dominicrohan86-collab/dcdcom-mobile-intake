CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_by_user_id` text,
	`scope` text DEFAULT 'workspace' NOT NULL,
	`inquiry_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_user` ON `chat_sessions` (`account_id`,`created_by_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_inquiry` ON `chat_sessions` (`account_id`,`inquiry_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`account_id` text NOT NULL,
	`inquiry_id` text,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_session` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_account` ON `chat_messages` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`label` text NOT NULL,
	`excerpt` text,
	`confidence_score` integer,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_sources_message` ON `chat_sources` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_sources_entity` ON `chat_sources` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `chat_files` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`account_id` text NOT NULL,
	`inquiry_id` text,
	`file_id` text,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer,
	`content_hash` text,
	`extracted_text` text,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`retention_expires_at` text,
	`uploaded_by_user_id` text,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_chat_files_session` ON `chat_files` (`session_id`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_files_account` ON `chat_files` (`account_id`,`uploaded_at`);
