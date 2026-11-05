ALTER TABLE `servers` ADD `allow_terminal` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `servers` ADD `allow_file_writes` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `servers` ADD `allow_orphan_removal` integer DEFAULT true NOT NULL;