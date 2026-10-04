import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import { testDatabase } from './helpers'

interface NameRow {
  name: string
}

describe('migrations', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  it('creates every table the data model needs', () => {
    const names = handle.sqlite
      .prepare<[], NameRow>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name)

    expect(names).toContain('projects')
    expect(names).toContain('items')
    expect(names).toContain('tags')
    expect(names).toContain('item_tags')
    expect(names).toContain('items_fts')
  })

  it('creates the three FTS sync triggers', () => {
    const names = handle.sqlite
      .prepare<[], NameRow>("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all()
      .map((row) => row.name)

    expect(names).toEqual(['items_fts_ad', 'items_fts_ai', 'items_fts_au'])
  })

  it('enforces foreign keys, so a project with items cannot be dropped', () => {
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)

    const now = Date.now()
    handle.sqlite
      .prepare('INSERT INTO projects (name, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('Alpha', 'active', now, now)
    handle.sqlite
      .prepare('INSERT INTO items (project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(1, 'belongs to Alpha', now, now)

    expect(() => handle.sqlite.prepare('DELETE FROM projects WHERE id = ?').run(1)).toThrow(
      /FOREIGN KEY constraint failed/
    )
  })

  it('keeps items_fts in sync on insert, update and delete', () => {
    const now = Date.now()
    const insert = handle.sqlite.prepare(
      'INSERT INTO items (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
    const search = (query: string): number[] =>
      handle.sqlite
        .prepare<[string], { id: number }>(
          'SELECT rowid AS id FROM items_fts WHERE items_fts MATCH ? ORDER BY rowid'
        )
        .all(query)
        .map((row) => row.id)

    const { lastInsertRowid } = insert.run('Postgres indexes', 'notes about GIN', now, now)
    const id = Number(lastInsertRowid)

    expect(search('postgres')).toEqual([id])

    handle.sqlite.prepare('UPDATE items SET content = ? WHERE id = ?').run('notes about BRIN', id)
    expect(search('GIN')).toEqual([])
    expect(search('BRIN')).toEqual([id])

    handle.sqlite.prepare('DELETE FROM items WHERE id = ?').run(id)
    expect(search('postgres')).toEqual([])
  })

  it('does not touch the FTS index when only a status changes', () => {
    const now = Date.now()
    handle.sqlite
      .prepare(
        'INSERT INTO items (title, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run('Ship export', 'JSON and Markdown', 'open', now, now)

    handle.sqlite.prepare("UPDATE items SET status = 'done' WHERE id = 1").run()

    const hits = handle.sqlite
      .prepare<[string], { id: number }>('SELECT rowid AS id FROM items_fts WHERE items_fts MATCH ?')
      .all('export')
      .map((row) => row.id)

    expect(hits).toEqual([1])
  })
})
