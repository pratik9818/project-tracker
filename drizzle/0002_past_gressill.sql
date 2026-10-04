CREATE TABLE `scratchpad` (
	`id` integer PRIMARY KEY NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`project_id` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
