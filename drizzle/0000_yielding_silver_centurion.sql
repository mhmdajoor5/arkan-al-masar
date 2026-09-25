CREATE TABLE `bookings` (
	`code` text PRIMARY KEY NOT NULL,
	`hold_token` text NOT NULL,
	`request_hash` text NOT NULL,
	`mobile` text NOT NULL,
	`email` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'demo' NOT NULL,
	`created` integer NOT NULL,
	`refund` text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_hold_token` ON `bookings` (`hold_token`);--> statement-breakpoint
CREATE INDEX `bookings_mobile` ON `bookings` (`mobile`);--> statement-breakpoint
CREATE INDEX `bookings_created` ON `bookings` (`created`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entities_kind` ON `entities` (`kind`);--> statement-breakpoint
CREATE TABLE `hold_groups` (
	`token` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL,
	`amount` integer NOT NULL,
	`expected` integer NOT NULL,
	`intent` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holds` (
	`trip_id` text NOT NULL,
	`seat` integer NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	PRIMARY KEY(`trip_id`, `seat`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `holds_token` ON `holds` (`token`);--> statement-breakpoint
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_code` text NOT NULL,
	`trip_id` text NOT NULL,
	`seat` integer NOT NULL,
	`name` text NOT NULL,
	`national_id` text NOT NULL,
	`nationality` text NOT NULL,
	`boarded` integer,
	`staff` text,
	FOREIGN KEY (`booking_code`) REFERENCES `bookings`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tickets_trip` ON `tickets` (`trip_id`);--> statement-breakpoint
CREATE INDEX `tickets_booking` ON `tickets` (`booking_code`);--> statement-breakpoint
CREATE INDEX `tickets_national_id` ON `tickets` (`national_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`starts` integer NOT NULL,
	`from_station` text NOT NULL,
	`to_station` text NOT NULL,
	`bus` text NOT NULL,
	`driver` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trips_route_date` ON `trips` (`from_station`,`to_station`,`date`);