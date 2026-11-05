-- File changes are now OFF by default, and every existing server is switched off
-- too (a safety default: the owner turns them back on with the typed confirmation).
-- SQLite cannot change a column default in place, and drizzle's generated fix is a
-- full rebuild of `servers`, which other tables reference with ON DELETE CASCADE.
-- Dropping and re-adding this one column avoids touching any other row or table:
-- the new column is `NOT NULL DEFAULT false`, so existing rows read 0 (off).
ALTER TABLE `servers` DROP COLUMN `allow_file_writes`;--> statement-breakpoint
ALTER TABLE `servers` ADD `allow_file_writes` integer DEFAULT false NOT NULL;
