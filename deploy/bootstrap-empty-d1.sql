-- Arkan Al-Masar: one-time schema bootstrap for a FRESH, EMPTY D1 database only.
-- Target database: arkan-al-masar-db (22c7a3e7-c16f-4fe3-a2bd-f0214eb53ab5).
-- Creates application tables/indexes and Wrangler migration metadata only.
-- Does not create an owner account, passwords, bookings, or other application data.
-- Does not migrate any existing Sites data. Do not rerun on an initialized database.
-- Derived from drizzle/*.sql; migration ledger matches pinned Wrangler 4.92.0.
-- No BEGIN/COMMIT statements: run through D1's SQL execution interface.

CREATE TABLE IF NOT EXISTS d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Migration: 0000_yielding_silver_centurion.sql
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

CREATE UNIQUE INDEX `bookings_hold_token` ON `bookings` (`hold_token`);
CREATE INDEX `bookings_mobile` ON `bookings` (`mobile`);
CREATE INDEX `bookings_created` ON `bookings` (`created`);
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL
);

CREATE INDEX `entities_kind` ON `entities` (`kind`);
CREATE TABLE `hold_groups` (
	`token` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL,
	`amount` integer NOT NULL,
	`expected` integer NOT NULL,
	`intent` text NOT NULL
);

CREATE TABLE `holds` (
	`trip_id` text NOT NULL,
	`seat` integer NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	PRIMARY KEY(`trip_id`, `seat`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `holds_token` ON `holds` (`token`);
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);

CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

CREATE TABLE `staff` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL
);

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

CREATE INDEX `tickets_trip` ON `tickets` (`trip_id`);
CREATE INDEX `tickets_booking` ON `tickets` (`booking_code`);
CREATE INDEX `tickets_national_id` ON `tickets` (`national_id`);
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

CREATE INDEX `trips_route_date` ON `trips` (`from_station`,`to_station`,`date`);
INSERT INTO d1_migrations (name) VALUES ('0000_yielding_silver_centurion.sql');

-- Migration: 0001_rainy_santa_claus.sql
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

CREATE UNIQUE INDEX `accounts_email` ON `accounts` (`email`);
CREATE TABLE `booking_access` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`booking_code` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`booking_code`) REFERENCES `bookings`(`code`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `booking_access_booking` ON `booking_access` (`booking_code`);
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `sessions_account` ON `sessions` (`account_id`);
CREATE TABLE `trip_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`phase` text NOT NULL,
	`created` integer NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `trip_event_phase` ON `trip_events` (`trip_id`,`phase`);
CREATE INDEX `trip_events_created` ON `trip_events` (`created`);
CREATE TABLE `trip_progress` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`updated` integer NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO d1_migrations (name) VALUES ('0001_rainy_santa_claus.sql');

-- Migration: 0002_sour_scarecrow.sql
CREATE TABLE `push_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);

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

CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`audience` text NOT NULL,
	`subject` text NOT NULL,
	`subscription` text NOT NULL,
	`locale` text DEFAULT 'ar' NOT NULL,
	`created` integer NOT NULL
);

CREATE INDEX `push_subject` ON `push_subscriptions` (`audience`,`subject`);
INSERT INTO d1_migrations (name) VALUES ('0002_sour_scarecrow.sql');

