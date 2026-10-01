CREATE TABLE `ledger_entries` (
 `id` text PRIMARY KEY NOT NULL,
 `category` text NOT NULL,
 `party` text NOT NULL,
 `entry_date` text NOT NULL,
 `statement` text NOT NULL,
 `description` text DEFAULT '' NOT NULL,
 `debit` integer DEFAULT 0 NOT NULL,
 `credit` integer DEFAULT 0 NOT NULL,
 `created` integer NOT NULL,
 `actor` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_category_date` ON `ledger_entries` (`category`,`entry_date`);
--> statement-breakpoint
CREATE INDEX `ledger_entries_party` ON `ledger_entries` (`party`);
--> statement-breakpoint
CREATE INDEX `ledger_entries_created` ON `ledger_entries` (`created`);
