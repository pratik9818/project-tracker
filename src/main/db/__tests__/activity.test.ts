import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import { activityCalendar, localDayKey } from '../queries/activity'
import { createItem, setItemStatus } from '../queries/items'
import { testDatabase } from './helpers'

/** Thursday 15 Jan 2026, local noon. Its week starts on Sunday 11 Jan. */
const NOW = new Date(2026, 0, 15, 12, 0, 0, 0).getTime()

/** The grid: 52 full weeks back from Sunday 11 Jan, plus Sun..Thu this week. */
const GRID_DAYS = 52 * 7 + 5
const TODAY = GRID_DAYS - 1

/** Index in `counts` of a local date (month is 1-based for readability). */
function indexOf(year: number, month: number, day: number): number {
  const start = new Date(2025, 0, 12)
  let index = 0
  for (const cursor = new Date(start); localDayKey(cursor) !== localDayKey(new Date(year, month - 1, day)); cursor.setDate(cursor.getDate() + 1)) {
    index += 1
  }
  return index
}

/** An entry closed at an exact moment, bypassing setItemStatus()'s clock. */
function closedAt(handle: DatabaseHandle, when: Date, lists?: string[]): number {
  const item = createItem(handle, { title: 'work', ...(lists !== undefined ? { lists } : {}) })
  handle.sqlite
    .prepare("UPDATE items SET status = 'done', done_at = ? WHERE id = ?")
    .run(when.getTime(), item.id)
  return item.id
}

describe('activityCalendar', () => {
  let handle: DatabaseHandle

  beforeEach(() => {
    handle = testDatabase()
  })

  afterEach(() => {
    handle.close()
  })

  it('starts on the Sunday 52 weeks before this week and ends today', () => {
    const calendar = activityCalendar(handle, NOW)

    expect(calendar.startDay).toBe('2025-01-12')
    expect(new Date(2025, 0, 12).getDay()).toBe(0)
    expect(calendar.counts).toHaveLength(GRID_DAYS)
    expect(calendar.total).toBe(0)
  })

  it('counts closed entries on the day they were closed, from every list', () => {
    closedAt(handle, new Date(2026, 0, 15, 9), ['bug'])
    closedAt(handle, new Date(2026, 0, 15, 10), ['nottoday'])
    closedAt(handle, new Date(2026, 0, 13, 18))

    const calendar = activityCalendar(handle, NOW)

    expect(calendar.counts[TODAY]).toBe(2)
    expect(calendar.counts[indexOf(2026, 1, 13)]).toBe(1)
    expect(calendar.total).toBe(3)
  })

  it('ignores open entries and entries that were reopened', () => {
    createItem(handle, { title: 'still open' })
    const reopened = closedAt(handle, new Date(2026, 0, 14, 9))
    setItemStatus(handle, reopened, 'open')

    expect(activityCalendar(handle, NOW).total).toBe(0)
  })

  it('splits days at local midnight', () => {
    closedAt(handle, new Date(2026, 0, 14, 23, 59))
    closedAt(handle, new Date(2026, 0, 15, 0, 1))

    const { counts } = activityCalendar(handle, NOW)

    expect(counts[TODAY - 1]).toBe(1)
    expect(counts[TODAY]).toBe(1)
  })

  it('leaves out work closed before the first cell', () => {
    closedAt(handle, new Date(2025, 0, 11, 12))
    closedAt(handle, new Date(2025, 0, 12, 0, 30))

    const calendar = activityCalendar(handle, NOW)

    expect(calendar.total).toBe(1)
    expect(calendar.counts[0]).toBe(1)
  })

  it('includes work closed later today', () => {
    closedAt(handle, new Date(2026, 0, 15, 22))

    expect(activityCalendar(handle, NOW).counts[TODAY]).toBe(1)
  })
})
