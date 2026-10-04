import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import { createItem, deleteItem, listItems } from '../queries/items'
import {
  addTagToItem,
  deleteOrphanedTags,
  ensureTag,
  listTags,
  listTagsWithCounts,
  normalizeTagName,
  removeTagFromItem,
  tagsForItem,
  tagsForItems
} from '../queries/tags'
import { createProject } from '../queries/projects'
import { testDatabase } from './helpers'

/**
 * An item with no tags at all. createItem() would file it under the default
 * list, which would get in the way of tests about tagging itself.
 */
function bareItem(handle: DatabaseHandle, title: string | null = null): { id: number } {
  const now = Date.now()
  const result = handle.sqlite
    .prepare("INSERT INTO items (title, status, created_at, updated_at) VALUES (?, 'open', ?, ?)")
    .run(title, now, now)
  return { id: Number(result.lastInsertRowid) }
}

describe('normalizeTagName', () => {
  it('lowercases, trims and strips a leading hash', () => {
    expect(normalizeTagName('Ops')).toBe('ops')
    expect(normalizeTagName('  #Ops  ')).toBe('ops')
    expect(normalizeTagName('##ops')).toBe('ops')
  })

  it('rejects an empty name', () => {
    expect(() => normalizeTagName('')).toThrow(/cannot be empty/)
    expect(() => normalizeTagName('  #  ')).toThrow(/cannot be empty/)
  })
})

describe('tags', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  it('creates a tag once and reuses it afterwards', () => {
    const first = ensureTag(handle, 'ops')
    const second = ensureTag(handle, 'OPS')

    expect(second.id).toBe(first.id)
    expect(listTags(handle)).toHaveLength(1)
  })

  it('attaches a tag to an item', () => {
    const item = bareItem(handle, 'Tagged')
    const tag = addTagToItem(handle, item.id, 'ops')

    expect(tagsForItem(handle, item.id)).toEqual([{ id: tag.id, name: 'ops' }])
  })

  it('treats differently-cased names as the same tag', () => {
    const item = bareItem(handle)
    addTagToItem(handle, item.id, 'Ops')
    addTagToItem(handle, item.id, '#ops')

    expect(tagsForItem(handle, item.id)).toHaveLength(1)
    expect(listTags(handle)).toHaveLength(1)
  })

  it('is idempotent, so tagging twice does not throw or duplicate', () => {
    const item = bareItem(handle)
    addTagToItem(handle, item.id, 'ops')

    expect(() => addTagToItem(handle, item.id, 'ops')).not.toThrow()
    expect(tagsForItem(handle, item.id)).toHaveLength(1)
  })

  it('returns an item tag list sorted by name', () => {
    const item = bareItem(handle)
    addTagToItem(handle, item.id, 'zebra')
    addTagToItem(handle, item.id, 'alpha')
    addTagToItem(handle, item.id, 'middle')

    expect(tagsForItem(handle, item.id).map((tag) => tag.name)).toEqual([
      'alpha',
      'middle',
      'zebra'
    ])
  })

  it('refuses to tag an item that does not exist', () => {
    expect(() => addTagToItem(handle, 42, 'ops')).toThrow(/No item with id 42/)
  })

  it('removes a tag from an item without deleting the tag itself', () => {
    const a = bareItem(handle)
    const b = bareItem(handle)
    const tag = addTagToItem(handle, a.id, 'ops')
    addTagToItem(handle, b.id, 'ops')

    expect(removeTagFromItem(handle, a.id, tag.id)).toBe(true)
    expect(tagsForItem(handle, a.id)).toEqual([])
    expect(tagsForItem(handle, b.id)).toHaveLength(1)
    expect(listTags(handle)).toHaveLength(1)
  })

  it('reports false when removing a tag that was not attached', () => {
    const item = bareItem(handle)
    expect(removeTagFromItem(handle, item.id, 999)).toBe(false)
  })

  it('drops the item_tags link when the item is deleted', () => {
    const item = bareItem(handle)
    addTagToItem(handle, item.id, 'ops')

    deleteItem(handle, item.id)

    expect(listTagsWithCounts(handle)).toEqual([])
  })

  it('counts how many items use each tag', () => {
    const a = bareItem(handle)
    const b = bareItem(handle)
    addTagToItem(handle, a.id, 'ops')
    addTagToItem(handle, b.id, 'ops')
    addTagToItem(handle, b.id, 'urgent')

    expect(listTagsWithCounts(handle)).toEqual([
      { id: expect.any(Number), name: 'ops', itemCount: 2 },
      { id: expect.any(Number), name: 'urgent', itemCount: 1 }
    ])
  })

  it('counts only the lists used in a scope, for the project tabs', () => {
    const project = createProject(handle, { name: 'Alpha' })
    createItem(handle, { lists: ['bug'], scope: { kind: 'project', projectId: project.id } })
    createItem(handle, { lists: ['bug'], scope: { kind: 'project', projectId: project.id } })
    createItem(handle, { lists: ['nottoday'] })

    expect(listTagsWithCounts(handle, { kind: 'project', projectId: project.id })).toEqual([
      { id: expect.any(Number), name: 'bug', itemCount: 2 }
    ])
    expect(listTagsWithCounts(handle, { kind: 'inbox' })).toEqual([
      { id: expect.any(Number), name: 'nottoday', itemCount: 1 }
    ])
    expect(listTagsWithCounts(handle).map((tag) => tag.name)).toEqual(['bug', 'nottoday'])
  })

  it('leaves unused tags out of the counted list', () => {
    ensureTag(handle, 'never-used')

    expect(listTags(handle)).toHaveLength(1)
    expect(listTagsWithCounts(handle)).toEqual([])
  })

  it('cleans up orphaned tags on request', () => {
    const item = bareItem(handle)
    const tag = addTagToItem(handle, item.id, 'ops')
    ensureTag(handle, 'orphan')

    expect(deleteOrphanedTags(handle)).toBe(1)
    expect(listTags(handle)).toEqual([{ id: tag.id, name: 'ops' }])
  })

  it('loads the tags of many items in one call, only for the ids asked', () => {
    const a = bareItem(handle)
    const b = bareItem(handle)
    const other = bareItem(handle)
    addTagToItem(handle, a.id, 'zebra')
    addTagToItem(handle, a.id, 'alpha')
    addTagToItem(handle, b.id, 'bug')
    addTagToItem(handle, other.id, 'ops')
    const untagged = bareItem(handle)

    expect(
      tagsForItems(handle, [a.id, b.id, untagged.id]).map((row) => [row.itemId, row.name])
    ).toEqual([
      [a.id, 'alpha'],
      [a.id, 'zebra'],
      [b.id, 'bug']
    ])
    expect(tagsForItems(handle, [])).toEqual([])
  })

  it('filters the item list by tag', () => {
    const tagged = bareItem(handle, 'has the tag')
    bareItem(handle, 'does not')
    const tag = addTagToItem(handle, tagged.id, 'ops')

    expect(listItems(handle, { tagId: tag.id }).map((item) => item.title)).toEqual(['has the tag'])
    expect(listItems(handle)).toHaveLength(2)
  })
})
