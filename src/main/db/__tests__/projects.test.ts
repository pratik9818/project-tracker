import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import {
  createProject,
  deleteProject,
  getProject,
  inboxCount,
  listProjects,
  projectStats,
  recentProjects,
  renameProject,
  setProjectStatus
} from '../queries/projects'
import { testDatabase } from './helpers'

/** Inserts an item directly; the items query layer arrives in step 5. */
function insertItem(
  handle: DatabaseHandle,
  fields: {
    projectId?: number | null
    title?: string
    status?: string
    createdAt?: number
  }
): number {
  const timestamp = fields.createdAt ?? Date.now()
  const result = handle.sqlite
    .prepare(
      'INSERT INTO items (project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      fields.projectId ?? null,
      fields.title ?? null,
      fields.status ?? 'open',
      timestamp,
      timestamp
    )
  return Number(result.lastInsertRowid)
}

describe('projects', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  it('creates a project with sensible defaults', () => {
    const project = createProject(handle, { name: 'DevVault' })

    expect(project.id).toBeGreaterThan(0)
    expect(project.name).toBe('DevVault')
    expect(project.status).toBe('active')
    expect(project.repoPath).toBeNull()
    expect(project.createdAt).toBeGreaterThan(0)
    expect(project.updatedAt).toBe(project.createdAt)
  })

  it('trims the name and rejects an empty one', () => {
    expect(createProject(handle, { name: '  Spaced  ' }).name).toBe('Spaced')
    expect(() => createProject(handle, { name: '   ' })).toThrow(/cannot be empty/)
  })

  it('reads a project back, and returns null for one that does not exist', () => {
    const created = createProject(handle, { name: 'Alpha', repoPath: 'D:/code/alpha' })

    expect(getProject(handle, created.id)).toEqual(created)
    expect(getProject(handle, 9999)).toBeNull()
  })

  it('orders the sidebar list active, then paused, then done', () => {
    const zeta = createProject(handle, { name: 'Zeta' })
    const alpha = createProject(handle, { name: 'Alpha' })
    const beta = createProject(handle, { name: 'Beta' })

    setProjectStatus(handle, beta.id, 'done')
    setProjectStatus(handle, zeta.id, 'paused')

    expect(listProjects(handle).map((p) => p.name)).toEqual(['Alpha', 'Zeta', 'Beta'])
    expect(listProjects(handle, { status: 'active' }).map((p) => p.name)).toEqual([alpha.name])
  })

  it('lists recently used projects by their newest item, skipping unused ones', () => {
    const alpha = createProject(handle, { name: 'Alpha' })
    const beta = createProject(handle, { name: 'Beta' })
    const gamma = createProject(handle, { name: 'Gamma' })
    createProject(handle, { name: 'Never used' })

    // Alpha has the oldest *and* the newest item: its newest one is what counts.
    insertItem(handle, { projectId: alpha.id, createdAt: 1_000 })
    insertItem(handle, { projectId: beta.id, createdAt: 2_000 })
    insertItem(handle, { projectId: gamma.id, createdAt: 3_000 })
    insertItem(handle, { projectId: alpha.id, status: 'open', createdAt: 4_000 })
    // An Inbox item is not a project, and must not pull anything in.
    insertItem(handle, { projectId: null, createdAt: 5_000 })

    expect(recentProjects(handle, 5).map((p) => p.name)).toEqual(['Alpha', 'Gamma', 'Beta'])
    expect(recentProjects(handle, 2).map((p) => p.name)).toEqual(['Alpha', 'Gamma'])
  })

  it('renames a project and bumps updated_at', () => {
    const created = createProject(handle, { name: 'Old name' })
    const renamed = renameProject(handle, created.id, 'New name')

    expect(renamed.name).toBe('New name')
    expect(renamed.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)
    expect(renamed.createdAt).toBe(created.createdAt)
  })

  it('archives a project by pausing it, keeping its items', () => {
    const project = createProject(handle, { name: 'Paused work' })
    insertItem(handle, { projectId: project.id, title: 'still here' })

    expect(setProjectStatus(handle, project.id, 'paused').status).toBe('paused')
    expect(projectStats(handle, project.id).items).toBe(1)
  })

  it('throws when renaming or re-statusing a project that does not exist', () => {
    expect(() => renameProject(handle, 42, 'Nope')).toThrow(/No project with id 42/)
    expect(() => setProjectStatus(handle, 42, 'done')).toThrow(/No project with id 42/)
  })

  describe('delete', () => {
    it('moves items to the Inbox when asked', () => {
      const project = createProject(handle, { name: 'Doomed' })
      const a = insertItem(handle, { projectId: project.id, title: 'keep me' })
      const b = insertItem(handle, {
        projectId: project.id,
        title: 'keep me too',
        status: 'open'
      })

      const result = deleteProject(handle, project.id, 'move_to_inbox')

      expect(result).toEqual({ movedToInbox: 2, deletedItems: 0 })
      expect(getProject(handle, project.id)).toBeNull()
      expect(inboxCount(handle)).toBe(2)

      const rows = handle.sqlite
        .prepare<[], { id: number; project_id: number | null }>(
          'SELECT id, project_id FROM items ORDER BY id'
        )
        .all()
      expect(rows).toEqual([
        { id: a, project_id: null },
        { id: b, project_id: null }
      ])
    })

    it('deletes items when asked, and keeps the search index in sync', () => {
      const project = createProject(handle, { name: 'Doomed' })
      const timestamp = Date.now()
      handle.sqlite
        .prepare(
          'INSERT INTO items (project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(project.id, 'Postgres notes', 'about GIN indexes', timestamp, timestamp)

      const result = deleteProject(handle, project.id, 'delete_items')

      expect(result).toEqual({ movedToInbox: 0, deletedItems: 1 })
      expect(getProject(handle, project.id)).toBeNull()
      expect(inboxCount(handle)).toBe(0)

      const hits = handle.sqlite
        .prepare<[string], { id: number }>(
          'SELECT rowid AS id FROM items_fts WHERE items_fts MATCH ?'
        )
        .all('postgres')
      expect(hits).toEqual([])
    })

    it('leaves items in other projects and the Inbox untouched', () => {
      const doomed = createProject(handle, { name: 'Doomed' })
      const keeper = createProject(handle, { name: 'Keeper' })
      insertItem(handle, { projectId: doomed.id })
      insertItem(handle, { projectId: keeper.id })
      insertItem(handle, { projectId: null })

      deleteProject(handle, doomed.id, 'delete_items')

      expect(projectStats(handle, keeper.id).items).toBe(1)
      expect(inboxCount(handle)).toBe(1)
    })

    it('throws for a project that does not exist', () => {
      expect(() => deleteProject(handle, 42, 'move_to_inbox')).toThrow(/No project with id 42/)
    })
  })

  describe('stats', () => {
    it('counts open vs done across every entry', () => {
      const project = createProject(handle, { name: 'Stats' })
      insertItem(handle, { projectId: project.id, status: 'open' })
      insertItem(handle, { projectId: project.id, status: 'doing' })
      insertItem(handle, { projectId: project.id, status: 'done' })
      insertItem(handle, { projectId: project.id, status: 'open' })
      insertItem(handle, { projectId: project.id, status: 'done' })

      expect(projectStats(handle, project.id)).toEqual({ open: 3, done: 2, items: 5 })
    })

    it('reports zeroes for an empty project', () => {
      const project = createProject(handle, { name: 'Empty' })
      expect(projectStats(handle, project.id)).toEqual({ open: 0, done: 0, items: 0 })
    })
  })
})
