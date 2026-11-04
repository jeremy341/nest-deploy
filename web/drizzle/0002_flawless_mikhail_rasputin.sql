CREATE TABLE `usage_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`server_id` text NOT NULL,
	`at` integer NOT NULL,
	`cpu_load` real,
	`cpus` integer,
	`mem_used_mb` integer,
	`mem_total_mb` integer,
	`disk_used_mb` integer,
	`disk_total_mb` integer,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_server_at_idx` ON `usage_samples` (`server_id`,`at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `monitor_state` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `monitor_since` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `monitor_failures` integer DEFAULT 0 NOT NULL;