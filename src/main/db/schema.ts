import { index, integer, sqliteTable, text, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'
import { ITEM_STATUSES, PROJECT_STATUSES } from '../../shared/types'

/**
 * The whole data model. Two real entities: projects and items.
 *
 * Deliberately NOT here:
 * - No item `type`. Every item is an entry in one or more lists, and a list is
 *   just a tag (#todo, #bug, #nottoday...). Users name lists by typing them, so
 *   there is no fixed set of categories to maintain.
 * - No blobs. `file_path` holds a path under userData/attachments/.
 * - No `embeddings` table yet. When semantic search arrives it becomes a new
 *   table keyed by item_id, so `items` does not have to change.
 *
 * The FTS5 virtual table and its triggers are NOT modelled here — drizzle-kit
 * cannot express them. They live in drizzle/0001_fts.sql.
 */

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    repoPath: text('repo_path'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [
    index('projects_status_idx').on(table.status),
    index('projects_name_idx').on(table.name)
  ]
)

export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * NULL = Inbox. `onDelete: 'restrict'` is deliberate: the database refuses
     * to drop a project that still owns items, which makes it impossible to
     * silently lose them. Deleting a project must first move its items to the
     * Inbox or delete them explicitly, inside one transaction.
     */
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'restrict' }),
    title: text('title'),
    content: text('content'),
    url: text('url'),
    language: text('language'),
    filePath: text('file_path'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),

    // Every entry can be ticked done. The column stays nullable only because
    // SQLite cannot add NOT NULL without rebuilding the table (which would drop
    // the FTS triggers); createItem() always sets it.
    status: text('status', { enum: ITEM_STATUSES }),
    priority: integer('priority'),
    dueAt: integer('due_at'),
    doneAt: integer('done_at')
  },
  (table) => [
    // Project page, and the Inbox query (project_id IS NULL).
    index('items_project_id_idx').on(table.projectId),
    // Work tracker: Today / Upcoming / All open.
    index('items_status_due_idx').on(table.status, table.dueAt),
    // Recent-items timeline.
    index('items_created_at_idx').on(table.createdAt),
    index('items_updated_at_idx').on(table.updatedAt)
  ]
)

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull()
  },
  (table) => [uniqueIndex('tags_name_unique').on(table.name)]
)

export const itemTags = sqliteTable(
  'item_tags',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    // "Show me every item with this tag" needs the reverse lookup too.
    index('item_tags_tag_id_idx').on(table.tagId)
  ]
)

export type ProjectRow = typeof projects.$inferSelect
export type NewProjectRow = typeof projects.$inferInsert
export type ItemRow = typeof items.$inferSelect
export type NewItemRow = typeof items.$inferInsert
export type TagRow = typeof tags.$inferSelect

/**
 * The Scratchpad buffer — a single row (id = 1).
 *
 * Deliberately NOT an item: this is raw, half-formed text that has not been
 * committed to anything yet. Keeping it out of `items` means a stray thought
 * never pollutes search, counts or the work tracker until the user says so.
 *
 * `project_id` is ON DELETE SET NULL, not RESTRICT: deleting a project should
 * fall the Scratchpad back to the Inbox, never block the deletion.
 */
export const scratchpad = sqliteTable('scratchpad', {
  id: integer('id').primaryKey(),
  content: text('content').notNull().default(''),
  /** Where committed lines will be filed. NULL = Inbox. */
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull()
})

export type ScratchpadRow = typeof scratchpad.$inferSelect
