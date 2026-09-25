CREATE TABLE `push_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_outbox` (
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`event_id`, `subscription_id`),
	FOREIGN KEY (`event_id`) REFERENCES `trip_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`audience` text NOT NULL,
	`subject` text NOT NULL,
	`subscription` text NOT NULL,
	`locale` text DEFAULT 'ar' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_subject` ON `push_subscriptions` (`audience`,`subject`);