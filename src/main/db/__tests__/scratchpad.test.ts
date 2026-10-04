import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import { listItems } from '../queries/items'
import { createProject } from '../queries/projects'
import { commitScratchpad, getScratchpad, saveScratchpad } from '../queries/scratchpad'
import { tagsForItem } from '../queries/tags'
import { testDatabase } from './helpers'

const THURSDAY = new Date(2026, 0, 15, 12, 0, 0, 0).getTime()

describe('scratchpad', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  it('starts empty and targets the Inbox', () => {
    const pad = getScratchpad(handle)

    expect(pad.content).toBe('')
    expect(pad.projectId).toBeNull()
  })

  it('saves and reads back the buffer', () => {
    saveScratchpad(handle, { content: '1. one\n2. #note two', projectId: null })

    expect(getScratchpad(handle).content).toBe('1. one\n2. #note two')
  })

  it('keeps exactly one row however many times it is read', () => {
    getScratchpad(handle)
    getScratchpad(handle)
    saveScratchpad(handle, { content: 'x', projectId: null })

    const rows = handle.sqlite.prepare('SELECT count(*) AS n FROM scratchpad').get() as { n: number }
    expect(rows.n).toBe(1)
  })

  describe('commit', () => {
    it('creates one item per actionable line, in the lists it names', () => {
      saveScratchpad(handle, {
        content: '1. fix the exporter\n2. #bug it crashes\n3. #nottoday just a thought',
        projectId: null
      })

      const result = commitScratchpad(handle, { at: THURSDAY })

      expect(result.created).toHaveLength(3)
      expect(
        result.created.map((item) => [tagsForItem(handle, item.id).map((t) => t.name), item.title])
      ).toEqual([
        // No #list on the line: filed under the default list.
        [['todo'], 'fix the exporter'],
        [['bug'], 'it crashes'],
        [['nottoday'], 'just a thought']
      ])
    })

    it('applies tags from #markers', () => {
      saveScratchpad(handle, { content: '1. ship it #urgent #release', projectId: null })

      const result = commitScratchpad(handle, { at: THURSDAY })
      const item = result.created[0]
      expect(item).toBeDefined()
      expect(tagsForItem(handle, item?.id ?? 0).map((tag) => tag.name)).toEqual([
        'release',
        'urgent'
      ])
    })

    it('applies a due date from an @marker', () => {
      saveScratchpad(handle, { content: '1. ship it @tomorrow', projectId: null })

      const result = commitScratchpad(handle, { at: THURSDAY })
      const due = result.created[0]?.dueAt

      expect(due).not.toBeNull()
      expect(new Date(due ?? 0).getDate()).toBe(16)
    })

    it('files items into the selected project', () => {
      const project = createProject(handle, { name: 'Alpha' })
      saveScratchpad(handle, { content: '1. in alpha', projectId: project.id })

      const result = commitScratchpad(handle, { at: THURSDAY })

      expect(result.created[0]?.projectId).toBe(project.id)
    })

    it('files into the Inbox when no project is selected', () => {
      saveScratchpad(handle, { content: '1. unfiled', projectId: null })

      expect(commitScratchpad(handle, { at: THURSDAY }).created[0]?.projectId).toBeNull()
    })

    it('removes committed lines so pressing commit twice cannot duplicate', () => {
      saveScratchpad(handle, { content: '1. one\n2. two', projectId: null })

      const first = commitScratchpad(handle, { at: THURSDAY })
      const second = commitScratchpad(handle, { at: THURSDAY })

      expect(first.created).toHaveLength(2)
      expect(second.created).toHaveLength(0)
      expect(listItems(handle)).toHaveLength(2)
    })

    it('keeps comment lines in the buffer', () => {
      saveScratchpad(handle, {
        content: '// keep me\n1. commit me\n// and me',
        projectId: null
      })

      const result = commitScratchpad(handle, { at: THURSDAY })

      expect(result.created).toHaveLength(1)
      expect(result.content).toBe('// keep me\n// and me')
      expect(getScratchpad(handle).content).toBe('// keep me\n// and me')
      expect(result.skipped).toBe(2)
    })

    it('does nothing for an empty buffer', () => {
      const result = commitScratchpad(handle, { at: THURSDAY })

      expect(result.created).toEqual([])
      expect(listItems(handle)).toEqual([])
    })

    it('indexes committed lines for search straight away', () => {
      saveScratchpad(handle, { content: '#note kubernetes rollout notes', projectId: null })
      commitScratchpad(handle, { at: THURSDAY })

      const hits = handle.sqlite
        .prepare<[string], { id: number }>('SELECT rowid AS id FROM items_fts WHERE items_fts MATCH ?')
        .all('"kubernetes"*')

      expect(hits).toHaveLength(1)
    })

    it('reuses an existing tag rather than creating a duplicate', () => {
      saveScratchpad(handle, { content: '1. a #shared\n2. b #shared', projectId: null })
      commitScratchpad(handle, { at: THURSDAY })

      const tags = handle.sqlite.prepare('SELECT count(*) AS n FROM tags').get() as { n: number }
      expect(tags.n).toBe(1)
    })
  })

  it('falls back to the Inbox when the selected project is deleted', () => {
    const project = createProject(handle, { name: 'Doomed' })
    saveScratchpad(handle, { content: '1. later', projectId: project.id })

    // ON DELETE SET NULL: deleting a project must not be blocked by the
    // scratchpad, and must not leave it pointing at a row that is gone.
    handle.sqlite.prepare('DELETE FROM projects WHERE id = ?').run(project.id)

    expect(getScratchpad(handle).projectId).toBeNull()
  })
})
