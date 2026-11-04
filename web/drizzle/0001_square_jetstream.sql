ALTER TABLE `projects` ADD `hook_hash` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `hook_created_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `notify_url_enc` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `notify_on` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_hook_idx` ON `projects` (`hook_hash`);