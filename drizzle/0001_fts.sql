-- Full-text search over items.title + items.content.
--
-- `content='items'` makes this an EXTERNAL CONTENT table: FTS5 stores only the
-- inverted index and reads the original text back from `items` by rowid. That
-- keeps the text in exactly one place (no duplicated copy to drift out of sync)
-- and keeps the database small.
--
-- Because FTS5 does not see writes to `items` by itself, the three triggers
-- below are what keep the index in sync. They are the only reason search stays
-- correct, so items.test.ts / search.test.ts assert on them directly.
--
-- `content` will later also hold OCR text and transcripts; nothing here needs
-- to change for that.
CREATE VIRTUAL TABLE `items_fts` USING fts5(
  title,
  content,
  content = 'items',
  content_rowid = 'id',
  tokenize = "unicode61 remove_diacritics 2"
);
--> statement-breakpoint

-- New item -> add it to the index.
CREATE TRIGGER `items_fts_ai` AFTER INSERT ON `items` BEGIN
  INSERT INTO `items_fts`(rowid, title, content)
  VALUES (new.`id`, new.`title`, new.`content`);
END;
--> statement-breakpoint

-- Deleted item -> remove it. For an external-content table the delete command
-- must be given the OLD column values so FTS5 can decrement the right terms.
CREATE TRIGGER `items_fts_ad` AFTER DELETE ON `items` BEGIN
  INSERT INTO `items_fts`(`items_fts`, rowid, title, content)
  VALUES ('delete', old.`id`, old.`title`, old.`content`);
END;
--> statement-breakpoint

-- Edited title/content -> delete the old index entry, insert the new one.
-- Scoped with `UPDATE OF title, content` so that flipping a status or setting a
-- due date does no FTS work at all.
CREATE TRIGGER `items_fts_au` AFTER UPDATE OF `title`, `content` ON `items` BEGIN
  INSERT INTO `items_fts`(`items_fts`, rowid, title, content)
  VALUES ('delete', old.`id`, old.`title`, old.`content`);
  INSERT INTO `items_fts`(rowid, title, content)
  VALUES (new.`id`, new.`title`, new.`content`);
END;
