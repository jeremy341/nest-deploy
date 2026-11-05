CREATE TABLE `alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`fired_at` integer NOT NULL,
	`resolved_at` integer,
	`muted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_events_project_idx` ON `alert_events` (`project_id`,`fired_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_disk_pct` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_mem_pct` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_cpu_pct` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_failures` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_slow_ms` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_on_down` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_on_recovery` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_on_resource` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_on_deploy` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_muted_until` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `alert_muted_forever` integer DEFAULT false NOT NULL;