CREATE TABLE `pageviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`at` integer NOT NULL,
	`path` text NOT NULL,
	`referrer` text,
	`visitor` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pageviews_project_at_idx` ON `pageviews` (`project_id`,`at`);--> statement-breakpoint
CREATE TABLE `project_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`at` integer NOT NULL,
	`mem_mb` real,
	`cpu_percent` real,
	`cpu_ns` real,
	`restarts` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_samples_idx` ON `project_samples` (`project_id`,`at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `analytics_key` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `status_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_analytics_idx` ON `projects` (`analytics_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_status_idx` ON `projects` (`status_key`);