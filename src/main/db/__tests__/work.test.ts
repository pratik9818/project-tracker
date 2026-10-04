import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import { createItem, setItemStatus, updateItem } from '../queries/items'
import { createProject } from '../queries/projects'
import {
  allOpenItems,
  doneItems,
  endOfLocalDay,
  overdueCount,
  todayItems,
  upcomingItems,
  workCounts
} from '../queries/work'
import { testDatabase } from './helpers'

/** A fixed local noon, so day-boundary maths is deterministic. */
const NOON = new Date(2026, 0, 15, 12, 0, 0, 0).getTime()
const DAY = 24 * 60 * 60 * 1000

function at(offsetDays: number, hour = 12): number {
  return new Date(2026, 0, 15 + offsetDays, hour, 0, 0, 0).getTime()
}

/** Creates a todo with a due date, bypassing the two-call create+update dance. */
function todo(
  handle: DatabaseHandle,
  title: string,
  fields: { dueAt?: number; priority?: number; projectId?: number } = {}
): number {
  const created = createItem(handle, {
    title,
    ...(fields.projectId !== undefined
      ? { scope: { kind: 'project' as const, projectId: fields.projectId } }
      : {})
  })
  if (fields.dueAt !== undefined || fields.priority !== undefined) {
    updateItem(handle, created.id, {
      ...(fields.dueAt !== undefined ? { dueAt: fields.dueAt } : {}),
      ...(fields.priority !== undefined ? { priority: fields.priority } : {})
    })
  }
  return created.id
}

describe('endOfLocalDay', () => {
  it('returns the last millisecond of the local day', () => {
    const end = new Date(endOfLocalDay(NOON))

    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(0)
    expect(end.getDate()).toBe(15)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
  })

  it('does not roll over for a time late in the day', () => {
    const lateNight = new Date(2026, 0, 15, 23, 30).getTime()
    expect(endOfLocalDay(lateNight)).toBe(endOfLocalDay(NOON))
  })
})

describe('work tracker', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  describe('today', () => {
    it('includes items due today and items that are overdue', () => {
      todo(handle, 'due today', { dueAt: at(0, 9) })
      todo(handle, 'overdue', { dueAt: at(-3) })
      todo(handle, 'due tomorrow', { dueAt: at(1) })
      todo(handle, 'no due date')

      expect(todayItems(handle, NOON).map((i) => i.title)).toEqual(['overdue', 'due today'])
    })

    it('puts the most overdue item first', () => {
      todo(handle, 'late by one day', { dueAt: at(-1) })
      todo(handle, 'late by ten days', { dueAt: at(-10) })
      todo(handle, 'due today', { dueAt: at(0, 23) })

      expect(todayItems(handle, NOON).map((i) => i.title)).toEqual([
        'late by ten days',
        'late by one day',
        'due today'
      ])
    })

    it('breaks a due-date tie by priority', () => {
      const sameTime = at(0, 9)
      todo(handle, 'low priority', { dueAt: sameTime, priority: 3 })
      todo(handle, 'high priority', { dueAt: sameTime, priority: 1 })
      todo(handle, 'no priority', { dueAt: sameTime })

      expect(todayItems(handle, NOON).map((i) => i.title)).toEqual([
        'high priority',
        'low priority',
        'no priority'
      ])
    })

    it('includes an item due at the very last millisecond of today', () => {
      todo(handle, 'last moment', { dueAt: endOfLocalDay(NOON) })
      expect(todayItems(handle, NOON).map((i) => i.title)).toEqual(['last moment'])
    })

    it('excludes an item due one millisecond into tomorrow', () => {
      todo(handle, 'just missed', { dueAt: endOfLocalDay(NOON) + 1 })
      expect(todayItems(handle, NOON)).toEqual([])
    })

    it('drops an item as soon as it is done', () => {
      const id = todo(handle, 'due today', { dueAt: at(0, 9) })
      expect(todayItems(handle, NOON)).toHaveLength(1)

      setItemStatus(handle, id, 'done')
      expect(todayItems(handle, NOON)).toEqual([])
    })

    it('keeps an item that is in progress', () => {
      const id = todo(handle, 'in progress', { dueAt: at(0, 9) })
      setItemStatus(handle, id, 'doing')

      expect(todayItems(handle, NOON).map((i) => i.title)).toEqual(['in progress'])
    })

    it('ignores undated entries, whatever list they are in', () => {
      createItem(handle, { title: 'a note', lists: ['note'] })
      todo(handle, 'real work', { dueAt: at(0) })

      expect(todayItems(handle, NOON).map((i) => i.title)).toEqual(['real work'])
    })

    it('includes a due entry from any list, not just #todo', () => {
      const bug = createItem(handle, { title: 'a bug', lists: ['bug'] })
      updateItem(handle, bug.id, { dueAt: at(0) })
      todo(handle, 'a todo', { dueAt: at(0) })

      expect(todayItems(handle, NOON)).toHaveLength(2)
    })
  })

  describe('project labels', () => {
    it('labels each item with its project name, and null for the Inbox', () => {
      const project = createProject(handle, { name: 'Alpha' })
      todo(handle, 'in alpha', { dueAt: at(0, 9), projectId: project.id })
      todo(handle, 'in inbox', { dueAt: at(0, 10) })

      expect(todayItems(handle, NOON).map((i) => [i.title, i.projectName])).toEqual([
        ['in alpha', 'Alpha'],
        ['in inbox', null]
      ])
    })
  })

  describe('upcoming', () => {
    it('only includes items due after today, soonest first', () => {
      todo(handle, 'due today', { dueAt: at(0) })
      todo(handle, 'next week', { dueAt: at(7) })
      todo(handle, 'tomorrow', { dueAt: at(1) })
      todo(handle, 'no due date')

      expect(upcomingItems(handle, NOON).map((i) => i.title)).toEqual(['tomorrow', 'next week'])
    })

    it('excludes done items', () => {
      const id = todo(handle, 'tomorrow', { dueAt: at(1) })
      setItemStatus(handle, id, 'done')

      expect(upcomingItems(handle, NOON)).toEqual([])
    })
  })

  describe('all open', () => {
    it('includes undated work so nothing can hide', () => {
      todo(handle, 'undated')
      todo(handle, 'overdue', { dueAt: at(-1) })
      todo(handle, 'future', { dueAt: at(5) })

      expect(allOpenItems(handle).map((i) => i.title).sort()).toEqual([
        'future',
        'overdue',
        'undated'
      ])
    })

    it('orders by priority first, then due date, with undated last', () => {
      todo(handle, 'p1 undated', { priority: 1 })
      todo(handle, 'p2 due soon', { dueAt: at(1), priority: 2 })
      todo(handle, 'p2 due later', { dueAt: at(9), priority: 2 })
      todo(handle, 'no priority', { dueAt: at(2) })

      expect(allOpenItems(handle).map((i) => i.title)).toEqual([
        'p1 undated',
        'p2 due soon',
        'p2 due later',
        'no priority'
      ])
    })

    it('excludes done work', () => {
      const id = todo(handle, 'finished')
      setItemStatus(handle, id, 'done')

      expect(allOpenItems(handle)).toEqual([])
    })
  })

  describe('done', () => {
    it('lists most recently completed first', () => {
      const first = todo(handle, 'finished first')
      const second = todo(handle, 'finished second')

      setItemStatus(handle, first, 'done')
      // done_at comes from the clock, so force a distinct, known ordering.
      handle.sqlite.prepare('UPDATE items SET done_at = ? WHERE id = ?').run(NOON - DAY, first)
      setItemStatus(handle, second, 'done')
      handle.sqlite.prepare('UPDATE items SET done_at = ? WHERE id = ?').run(NOON, second)

      expect(doneItems(handle).map((i) => i.title)).toEqual([
        'finished second',
        'finished first'
      ])
    })

    it('respects the limit', () => {
      for (let n = 0; n < 5; n += 1) {
        setItemStatus(handle, todo(handle, `done ${n}`), 'done')
      }

      expect(doneItems(handle, 2)).toHaveLength(2)
    })
  })

  describe('counts', () => {
    it('tallies each bucket of the sidebar', () => {
      todo(handle, 'overdue', { dueAt: at(-2) })
      todo(handle, 'due today', { dueAt: at(0) })
      todo(handle, 'tomorrow', { dueAt: at(1) })
      todo(handle, 'undated')
      setItemStatus(handle, todo(handle, 'finished'), 'done')
      createItem(handle, { title: 'a note is open work too', lists: ['note'] })

      expect(workCounts(handle, NOON)).toEqual({ today: 2, upcoming: 1, open: 5, done: 1 })
    })

    it('counts only items due before today as overdue', () => {
      todo(handle, 'overdue', { dueAt: at(-1) })
      todo(handle, 'due today', { dueAt: at(0, 9) })

      expect(overdueCount(handle, NOON)).toBe(1)
    })

    it('reports zeroes on an empty database', () => {
      expect(workCounts(handle, NOON)).toEqual({ today: 0, upcoming: 0, open: 0, done: 0 })
      expect(overdueCount(handle, NOON)).toBe(0)
    })
  })
})
