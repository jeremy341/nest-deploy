CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`target` text,
	`meta` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployment_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deployment_id` text NOT NULL,
	`at` integer NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `logs_deployment_idx` ON `deployment_logs` (`deployment_id`,`id`);--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`triggered_by` text,
	`env` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`source` text NOT NULL,
	`branch` text NOT NULL,
	`commit_sha` text,
	`commit_message` text,
	`author` text,
	`port` integer NOT NULL,
	`release_id` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`cleaned_up` integer DEFAULT false NOT NULL,
	`archive_bytes` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deployments_project_idx` ON `deployments` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `deployments_state_idx` ON `deployments` (`state`);--> statement-breakpoint
CREATE TABLE `domains` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`server_id` text NOT NULL,
	`project_id` text,
	`domain` text NOT NULL,
	`port` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_domain_idx` ON `domains` (`domain`);--> statement-breakpoint
CREATE TABLE `env_vars` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value_enc` text NOT NULL,
	`target` text DEFAULT 'all' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `env_project_key_idx` ON `env_vars` (`project_id`,`key`,`target`);--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`deployment_id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_by` text,
	`locked_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_state_idx` ON `jobs` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`server_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`repo_full_name` text,
	`repo_url` text NOT NULL,
	`installation_id` integer,
	`production_branch` text DEFAULT 'main' NOT NULL,
	`root_dir` text DEFAULT '.' NOT NULL,
	`runtime` text NOT NULL,
	`install_command` text,
	`build_command` text,
	`start_command` text,
	`output_dir` text,
	`port` integer NOT NULL,
	`health_path` text DEFAULT '/' NOT NULL,
	`auto_deploy` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_slug_idx` ON `projects` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`nest_username` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`public_key` text NOT NULL,
	`private_key_enc` text NOT NULL,
	`key_fingerprint` text NOT NULL,
	`host_key_fingerprint` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`probe` text,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `servers_user_nest_idx` ON `servers` (`user_id`,`nest_username`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`hack_club_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`slack_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_hack_club_id_unique` ON `users` (`hack_club_id`);