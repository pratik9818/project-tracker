import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import {
  countItems,
  createItem,
  deleteItem,
  getItem,
  listItems,
  moveItem,
  setItemStatus,
  toggleItemDone,
  updateItem
} from '../queries/items'
import { createProject } from '../queries/projects'
import { ensureTag, tagsForItem } from '../queries/tags'
import { testDatabase } from './helpers'

function ftsIds(handle: DatabaseHandle, query: string): number[] {
  return handle.sqlite
    .prepare<[string], { id: number }>(
      'SELECT rowid AS id FROM items_fts WHERE items_fts MATCH ? ORDER BY rowid'
    )
    .all(query)
    .map((row) => row.id)
}

function listNames(handle: DatabaseHandle, itemId: number): string[] {
  return tagsForItem(handle, itemId).map((tag) => tag.name)
}

describe('items', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  describe('create', () => {
    it('puts an item with no scope in the Inbox', () => {
      const item = createItem(handle, { title: 'Dumped thought' })

      expect(item.projectId).toBeNull()
      expect(item.createdAt).toBe(item.updatedAt)
    })

    it('files an entry with no list under #todo', () => {
      const item = createItem(handle, { title: 'No list given' })

      expect(listNames(handle, item.id)).toEqual(['todo'])
    })

    it('files an entry under every list it was given', () => {
      const item = createItem(handle, { title: 'Crash on save', lists: ['bug', 'urgent'] })

      expect(listNames(handle, item.id)).toEqual(['bug', 'urgent'])
    })

    it('normalises list names, so #Bug and bug are one list', () => {
      const first = createItem(handle, { title: 'one', lists: ['#Bug'] })
      const second = createItem(handle, { title: 'two', lists: ['bug'] })

      expect(listNames(handle, first.id)).toEqual(['bug'])
      expect(listNames(handle, second.id)).toEqual(['bug'])
    })

    it('reuses an existing list rather than creating a duplicate', () => {
      const existing = ensureTag(handle, 'nottoday')
      const item = createItem(handle, { title: 'later', lists: ['nottoday'] })

      expect(tagsForItem(handle, item.id)).toEqual([existing])
    })

    it('starts every entry open, whatever list it is in', () => {
      const item = createItem(handle, { title: 'Just a note', lists: ['note'] })

      expect(item.status).toBe('open')
      expect(item.doneAt).toBeNull()
    })

    it('stamps done_at when an entry is created already done', () => {
      const item = createItem(handle, { title: 'Already did it', status: 'done' })

      expect(item.status).toBe('done')
      expect(item.doneAt).toBeGreaterThan(0)
    })

    it('keeps priority, due date, language and url on any entry', () => {
      const item = createItem(handle, {
        title: 'Reset a branch',
        content: 'git reset --hard origin/main',
        language: 'sh',
        url: 'https://example.com',
        priority: 1,
        dueAt: 123,
        lists: ['snippet']
      })

      expect(item.language).toBe('sh')
      expect(item.url).toBe('https://example.com')
      expect(item.priority).toBe(1)
      expect(item.dueAt).toBe(123)
    })

    it('files an item into a project when scoped to one', () => {
      const project = createProject(handle, { name: 'Alpha' })
      const item = createItem(handle, {
        title: 'Crash on open',
        lists: ['bug'],
        scope: { kind: 'project', projectId: project.id }
      })

      expect(item.projectId).toBe(project.id)
    })

    it('indexes the new item for search', () => {
      const item = createItem(handle, { title: 'Postgres indexes', content: 'GIN vs BRIN' })

      expect(ftsIds(handle, 'postgres')).toEqual([item.id])
      expect(ftsIds(handle, 'BRIN')).toEqual([item.id])
    })
  })

  describe('update', () => {
    it('edits content and reindexes it for search', () => {
      const item = createItem(handle, { title: 'Old title', content: 'old body' })

      const updated = updateItem(handle, item.id, { title: 'New title', content: 'new body' })

      expect(updated.title).toBe('New title')
      expect(updated.content).toBe('new body')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(item.updatedAt)
      expect(ftsIds(handle, 'old')).toEqual([])
      expect(ftsIds(handle, 'new')).toEqual([item.id])
    })

    it('leaves omitted fields alone but can clear one with null', () => {
      const item = createItem(handle, { title: 'Keep me', content: 'body', language: 'ts' })

      const noLanguage = updateItem(handle, item.id, { language: null })

      expect(noLanguage.language).toBeNull()
      expect(noLanguage.title).toBe('Keep me')
      expect(noLanguage.content).toBe('body')
    })

    it('accepts priority and due date on any entry', () => {
      const item = createItem(handle, { title: 'Entry', lists: ['note'] })

      const updated = updateItem(handle, item.id, { priority: 2, dueAt: 1700000000000 })

      expect(updated.priority).toBe(2)
      expect(updated.dueAt).toBe(1700000000000)
    })

    it('throws for an item that does not exist', () => {
      expect(() => updateItem(handle, 42, { title: 'x' })).toThrow(/No item with id 42/)
    })
  })

  describe('status', () => {
    it('stamps done_at on done and clears it on reopen', () => {
      const item = createItem(handle, { title: 'Task' })

      const done = setItemStatus(handle, item.id, 'done')
      expect(done.doneAt).toBeGreaterThan(0)

      const reopened = setItemStatus(handle, item.id, 'open')
      expect(reopened.status).toBe('open')
      expect(reopened.doneAt).toBeNull()
    })

    it('does not move done_at when re-marking an already done item', () => {
      const item = createItem(handle, { title: 'Task', status: 'done' })

      const again = setItemStatus(handle, item.id, 'done')

      expect(again.doneAt).toBe(item.doneAt)
    })

    it('toggles any entry between done and open', () => {
      const item = createItem(handle, { title: 'A note', lists: ['note'] })

      expect(toggleItemDone(handle, item.id).status).toBe('done')
      expect(toggleItemDone(handle, item.id).status).toBe('open')
    })
  })

  describe('move', () => {
    it('moves an item into a project and back to the Inbox', () => {
      const project = createProject(handle, { name: 'Alpha' })
      const item = createItem(handle, { title: 'Floating' })

      expect(moveItem(handle, item.id, { kind: 'project', projectId: project.id }).projectId).toBe(
        project.id
      )
      expect(moveItem(handle, item.id, { kind: 'inbox' }).projectId).toBeNull()
    })

    it('rejects a nonsensical destination', () => {
      const item = createItem(handle, {})
      expect(() => moveItem(handle, item.id, { kind: 'all' })).toThrow(/scope "all"/)
    })
  })

  describe('delete', () => {
    it('removes the item and its search-index entry', () => {
      const item = createItem(handle, { title: 'Ephemeral' })

      expect(deleteItem(handle, item.id)).toBe(true)
      expect(getItem(handle, item.id)).toBeNull()
      expect(ftsIds(handle, 'ephemeral')).toEqual([])
    })

    it('reports false for an item that was not there', () => {
      expect(deleteItem(handle, 42)).toBe(false)
    })
  })

  describe('list', () => {
    it('filters by scope, separating Inbox from projects', () => {
      const project = createProject(handle, { name: 'Alpha' })
      createItem(handle, { title: 'inbox one' })
      createItem(handle, { title: 'inbox two' })
      createItem(handle, {
        title: 'project one',
        scope: { kind: 'project', projectId: project.id }
      })

      expect(listItems(handle, { scope: { kind: 'inbox' } }).map((i) => i.title)).toEqual([
        'inbox two',
        'inbox one'
      ])
      expect(
        listItems(handle, { scope: { kind: 'project', projectId: project.id } }).map((i) => i.title)
      ).toEqual(['project one'])
      expect(listItems(handle, { scope: { kind: 'all' } })).toHaveLength(3)
      expect(listItems(handle)).toHaveLength(3)
    })

    it('filters by list and by status', () => {
      createItem(handle, { title: 'a note', lists: ['note'] })
      createItem(handle, { title: 'an open todo' })
      createItem(handle, { title: 'a done todo', status: 'done' })
      createItem(handle, { title: 'a bug', lists: ['bug'] })
      const todo = ensureTag(handle, 'todo')

      expect(listItems(handle, { tagId: todo.id })).toHaveLength(2)
      expect(listItems(handle, { tagId: todo.id, statuses: ['done'] }).map((i) => i.title)).toEqual(
        ['a done todo']
      )
      expect(listItems(handle, { statuses: ['open'] })).toHaveLength(3)
    })

    it('returns newest first, and can page', () => {
      for (let n = 1; n <= 5; n += 1) {
        createItem(handle, { title: `note ${n}` })
      }

      expect(listItems(handle, { limit: 2 }).map((i) => i.title)).toEqual(['note 5', 'note 4'])
      expect(listItems(handle, { limit: 2, offset: 2 }).map((i) => i.title)).toEqual([
        'note 3',
        'note 2'
      ])
    })

    it('counts with the same filters', () => {
      createItem(handle, { lists: ['note'] })
      createItem(handle, {})
      createItem(handle, { status: 'done' })
      const todo = ensureTag(handle, 'todo')

      expect(countItems(handle)).toBe(3)
      expect(countItems(handle, { tagId: todo.id })).toBe(2)
      expect(countItems(handle, { tagId: todo.id, statuses: ['done'] })).toBe(1)
    })
  })
})
