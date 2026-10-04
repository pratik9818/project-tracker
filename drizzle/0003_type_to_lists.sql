-- Items no longer have a type. Every item is an entry in one or more lists,
-- and a list is just a #tag (#todo, #bug, #nottoday, ...).
--
-- This runs BEFORE the migration that drops `items.type`, so the old type can
-- be carried over as a list name and nothing the user filed is lost:
-- an old `bug` becomes an entry in #bug, an old `note` an entry in #note.

-- 1. Make sure a tag exists for every type that is actually in use.
INSERT OR IGNORE INTO `tags` (`name`)
SELECT DISTINCT `type` FROM `items`;
--> statement-breakpoint

-- 2. Put each item in the list named after its old type.
INSERT OR IGNORE INTO `item_tags` (`item_id`, `tag_id`)
SELECT `items`.`id`, `tags`.`id`
FROM `items`
JOIN `tags` ON `tags`.`name` = `items`.`type`;
--> statement-breakpoint

-- 3. Every entry can now be ticked done, so the ones that had no status
--    (old notes, snippets, links) start out open.
UPDATE `items` SET `status` = 'open' WHERE `status` IS NULL;
