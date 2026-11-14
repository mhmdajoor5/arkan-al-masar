CREATE INDEX IF NOT EXISTS `trips_date` ON `trips` (`date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trips_status_starts` ON `trips` (`status`,`starts`);
