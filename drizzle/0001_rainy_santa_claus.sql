CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`driver_id` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL,
	`must_change` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `booking_access` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`booking_code` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`booking_code`) REFERENCES `bookings`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_access_booking` ON `booking_access` (`booking_code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_account` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE TABLE `trip_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`phase` text NOT NULL,
	`created` integer NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_event_phase` ON `trip_events` (`trip_id`,`phase`);--> statement-breakpoint
CREATE INDEX `trip_events_created` ON `trip_events` (`created`);--> statement-breakpoint
CREATE TABLE `trip_progress` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`updated` integer NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
