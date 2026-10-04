import { asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { ItemScope, ItemTag, Tag, TagWithCount } from '../../../shared/types'
import type { DatabaseHandle } from '../client'
import { itemTags, items, tags } from '../schema'

/**
 * Tags, and the many-to-many link between tags and items.
 *
 * Tag names are normalised to lowercase with any leading '#' stripped, so
 * "Ops", "ops" and "#ops" are one tag. Without that, the tag list fills up with
 * near-duplicates and filtering silently misses items.
 */

export function normalizeTagName(raw: string): string {
  const name = raw.trim().replace(/^#+/, '').trim().toLowerCase()
  if (name.length === 0) throw new Error('Tag name cannot be empty')
  return name
}

/** Finds a tag by name, creating it if it does not exist yet. */
export function ensureTag(handle: DatabaseHandle, rawName: string): Tag {
  const name = normalizeTagName(rawName)

  const existing = handle.db.select().from(tags).where(eq(tags.name, name)).get()
  if (existing !== undefined) return existing

  const [created] = handle.db.insert(tags).values({ name }).returning().all()
  if (created === undefined) throw new Error(`Failed to create tag "${name}"`)
  return created
}

/**
 * Tags an item, creating the tag if needed. Idempotent: tagging twice is a
 * no-op rather than an error, which is what the UI wants.
 */
export function addTagToItem(handle: DatabaseHandle, itemId: number, rawName: string): Tag {
  return handle.db.transaction((tx): Tag => {
    const item = tx.select({ id: items.id }).from(items).where(eq(items.id, itemId)).get()
    if (item === undefined) throw new Error(`No item with id ${itemId}`)

    const name = normalizeTagName(rawName)
    const existing = tx.select().from(tags).where(eq(tags.name, name)).get()
    const tag =
      existing ??
      (() => {
        const [created] = tx.insert(tags).values({ name }).returning().all()
        if (created === undefined) throw new Error(`Failed to create tag "${name}"`)
        return created
      })()

    tx.insert(itemTags).values({ itemId, tagId: tag.id }).onConflictDoNothing().run()
    return tag
  })
}

/** Untags an item. Returns false if the link was not there. */
export function removeTagFromItem(handle: DatabaseHandle, itemId: number, tagId: number): boolean {
  return (
    handle.db
      .delete(itemTags)
      .where(sql`${itemTags.itemId} = ${itemId} and ${itemTags.tagId} = ${tagId}`)
      .run().changes > 0
  )
}

export function tagsForItem(handle: DatabaseHandle, itemId: number): Tag[] {
  return handle.db
    .select({ id: tags.id, name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(eq(itemTags.itemId, itemId))
    .orderBy(asc(tags.name))
    .all()
}

/**
 * The tags of many items in one query, for showing list chips on every row of
 * a screen. One call per screen instead of one per row (a list can have 500).
 * Sorted by item, then tag name; items with no tags simply do not appear.
 */
export function tagsForItems(handle: DatabaseHandle, itemIds: readonly number[]): ItemTag[] {
  if (itemIds.length === 0) return []
  return handle.db
    .select({ itemId: itemTags.itemId, id: tags.id, name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(inArray(itemTags.itemId, [...itemIds]))
    .orderBy(asc(itemTags.itemId), asc(tags.name))
    .all()
}

/**
 * Every tag that is attached to at least one item, with its usage count — the
 * list filter, and the project page's tabs (one tab per list used there).
 *
 * `scope` narrows it to the lists used in one project or in the Inbox.
 */
export function listTagsWithCounts(
  handle: DatabaseHandle,
  scope: ItemScope = { kind: 'all' }
): TagWithCount[] {
  const where =
    scope.kind === 'project'
      ? eq(items.projectId, scope.projectId)
      : scope.kind === 'inbox'
        ? isNull(items.projectId)
        : undefined

  return handle.db
    .select({ id: tags.id, name: tags.name, itemCount: count(itemTags.itemId) })
    .from(tags)
    .innerJoin(itemTags, eq(itemTags.tagId, tags.id))
    .innerJoin(items, eq(items.id, itemTags.itemId))
    .where(where)
    .groupBy(tags.id, tags.name)
    .orderBy(asc(tags.name))
    .all()
}

export function listTags(handle: DatabaseHandle): Tag[] {
  return handle.db.select().from(tags).orderBy(asc(tags.name)).all()
}

/**
 * Deletes tags that are no longer attached to anything.
 *
 * Removing the last item from a tag leaves the tag row behind; this is the
 * cleanup. Called after untagging so the tag filter does not accumulate dead
 * entries.
 */
export function deleteOrphanedTags(handle: DatabaseHandle): number {
  return handle.sqlite
    .prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)')
    .run().changes
}
