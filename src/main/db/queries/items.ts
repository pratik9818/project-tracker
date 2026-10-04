import { and, asc, count, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm'
import {
  DEFAULT_LIST,
  type CreateItemInput,
  type Item,
  type ItemScope,
  type ItemStatus,
  type ListItemsFilter,
  type UpdateItemInput
} from '../../../shared/types'
import type { DatabaseHandle } from '../client'
import { itemTags, items } from '../schema'
import { ensureTag } from './tags'

/**
 * Item CRUD and listing.
 *
 * `items` is the only table the three views read from — Inbox, the work tracker
 * and the project page are all just different filters over it.
 *
 * There are no item types. Every item is an entry in one or more lists, and a
 * list is a tag. The one invariant this module owns: an entry always belongs to
 * at least one list — `createItem()` files it under DEFAULT_LIST when none was
 * given, so no entry can fall out of every project tab.
 */

function now(): number {
  return Date.now()
}

function scopeCondition(scope: ItemScope): SQL | undefined {
  switch (scope.kind) {
    case 'all':
      return undefined
    case 'inbox':
      return isNull(items.projectId)
    case 'project':
      return eq(items.projectId, scope.projectId)
  }
}

/**
 * Creates an entry and files it under its lists, in one transaction.
 *
 * A better-sqlite3 transaction function called inside another one becomes a
 * savepoint, so this is safe to call from the scratchpad commit, which wraps
 * many of these in its own transaction.
 */
export function createItem(handle: DatabaseHandle, input: CreateItemInput): Item {
  const run = handle.sqlite.transaction((): Item => {
    const timestamp = now()
    const scope = input.scope ?? { kind: 'inbox' }
    const status = input.status ?? 'open'

    const [row] = handle.db
      .insert(items)
      .values({
        projectId: scope.kind === 'project' ? scope.projectId : null,
        title: input.title ?? null,
        content: input.content ?? null,
        url: input.url ?? null,
        language: input.language ?? null,
        filePath: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        status,
        priority: input.priority ?? null,
        dueAt: input.dueAt ?? null,
        doneAt: status === 'done' ? timestamp : null
      })
      .returning()
      .all()

    if (row === undefined) throw new Error('Failed to create item')

    const lists = input.lists !== undefined && input.lists.length > 0 ? input.lists : [DEFAULT_LIST]
    for (const name of lists) {
      const tag = ensureTag(handle, name)
      handle.db.insert(itemTags).values({ itemId: row.id, tagId: tag.id }).onConflictDoNothing().run()
    }

    return row
  })

  return run()
}

export function getItem(handle: DatabaseHandle, id: number): Item | null {
  return handle.db.select().from(items).where(eq(items.id, id)).get() ?? null
}

function requireItem(handle: DatabaseHandle, id: number): Item {
  const item = getItem(handle, id)
  if (item === null) throw new Error(`No item with id ${id}`)
  return item
}

/**
 * Edits an entry's content fields. Status is deliberately NOT editable here —
 * it goes through setItemStatus(), which keeps done_at truthful.
 */
export function updateItem(handle: DatabaseHandle, id: number, patch: UpdateItemInput): Item {
  const existing = requireItem(handle, id)

  const [row] = handle.db
    .update(items)
    .set({
      title: patch.title !== undefined ? patch.title : existing.title,
      content: patch.content !== undefined ? patch.content : existing.content,
      url: patch.url !== undefined ? patch.url : existing.url,
      language: patch.language !== undefined ? patch.language : existing.language,
      priority: patch.priority !== undefined ? patch.priority : existing.priority,
      dueAt: patch.dueAt !== undefined ? patch.dueAt : existing.dueAt,
      updatedAt: now()
    })
    .where(eq(items.id, id))
    .returning()
    .all()

  if (row === undefined) throw new Error(`No item with id ${id}`)
  return row
}

/**
 * Sets an entry's status. Moving to 'done' stamps done_at; moving away from
 * 'done' clears it, so "when did I finish this" is always truthful.
 */
export function setItemStatus(handle: DatabaseHandle, id: number, status: ItemStatus): Item {
  const existing = requireItem(handle, id)

  const [row] = handle.db
    .update(items)
    .set({
      status,
      doneAt: status === 'done' ? (existing.doneAt ?? now()) : null,
      updatedAt: now()
    })
    .where(eq(items.id, id))
    .returning()
    .all()

  if (row === undefined) throw new Error(`No item with id ${id}`)
  return row
}

/** The keyboard shortcut: done -> open, anything else -> done. */
export function toggleItemDone(handle: DatabaseHandle, id: number): Item {
  const existing = requireItem(handle, id)
  return setItemStatus(handle, id, existing.status === 'done' ? 'open' : 'done')
}

/** Moves an item between projects, or to the Inbox with `{ kind: 'inbox' }`. */
export function moveItem(handle: DatabaseHandle, id: number, scope: ItemScope): Item {
  if (scope.kind === 'all') throw new Error('Cannot move an item to scope "all"')
  requireItem(handle, id)

  const [row] = handle.db
    .update(items)
    .set({
      projectId: scope.kind === 'project' ? scope.projectId : null,
      updatedAt: now()
    })
    .where(eq(items.id, id))
    .returning()
    .all()

  if (row === undefined) throw new Error(`No item with id ${id}`)
  return row
}

export function deleteItem(handle: DatabaseHandle, id: number): boolean {
  // item_tags rows go with it (ON DELETE CASCADE) and the FTS delete trigger
  // removes the search-index entry.
  return handle.db.delete(items).where(eq(items.id, id)).run().changes > 0
}

/** The WHERE conditions shared by listItems and countItems. */
function filterConditions(handle: DatabaseHandle, filter: ListItemsFilter): SQL[] {
  const conditions: SQL[] = []

  const scoped = scopeCondition(filter.scope ?? { kind: 'all' })
  if (scoped !== undefined) conditions.push(scoped)

  if (filter.statuses !== undefined && filter.statuses.length > 0) {
    conditions.push(inArray(items.status, [...filter.statuses]))
  }
  if (filter.tagId !== undefined) {
    conditions.push(
      inArray(
        items.id,
        handle.db.select({ id: itemTags.itemId }).from(itemTags).where(eq(itemTags.tagId, filter.tagId))
      )
    )
  }

  return conditions
}

export function listItems(handle: DatabaseHandle, filter: ListItemsFilter = {}): Item[] {
  const conditions = filterConditions(handle, filter)

  const order =
    filter.orderBy === 'updated_desc'
      ? [desc(items.updatedAt), desc(items.id)]
      : [desc(items.createdAt), desc(items.id)]

  let query = handle.db
    .select()
    .from(items)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...order)
    .$dynamic()

  if (filter.limit !== undefined) query = query.limit(filter.limit)
  if (filter.offset !== undefined) query = query.offset(filter.offset)

  return query.all()
}

export function countItems(handle: DatabaseHandle, filter: ListItemsFilter = {}): number {
  const conditions = filterConditions(handle, filter)

  return (
    handle.db
      .select({ n: count() })
      .from(items)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .get()?.n ?? 0
  )
}

/** Oldest-first listing, used by the export so output is stable and diffable. */
export function listAllItemsForExport(handle: DatabaseHandle): Item[] {
  return handle.db.select().from(items).orderBy(asc(items.id)).all()
}
