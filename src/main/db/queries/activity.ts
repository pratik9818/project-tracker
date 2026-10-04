import { and, eq, gte, isNotNull, lte } from 'drizzle-orm'
import type { ActivityCalendar } from '../../../shared/types'
import type { DatabaseHandle } from '../client'
import { items } from '../schema'
import { endOfLocalDay } from './work'

/**
 * The contribution graph: how many entries were closed on each day.
 *
 * "Closed" means status = 'done', counted on the day done_at falls on. Every
 * list counts — #bug, #todo, #whatever. Reopening an entry clears done_at, so
 * the graph only ever shows work that is still done.
 *
 * The grid shape lives here rather than in the renderer: 53 columns of weeks,
 * Sunday at the top, starting on the Sunday 52 weeks before the current week.
 * Days are bucketed by LOCAL calendar day in JavaScript (not SQLite), so the
 * day boundary is the same one the rest of the app uses. `now` is a parameter
 * so all of this is testable without mocking the clock.
 */

/** How many full weeks of history before the current week. */
const WEEKS_BACK = 52

/** `YYYY-MM-DD` for the local day containing `date`. */
export function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function activityCalendar(handle: DatabaseHandle, now: number = Date.now()): ActivityCalendar {
  // The first cell: local midnight on the Sunday 52 weeks before this week's.
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay() - WEEKS_BACK * 7)

  // One slot per local day from `start` through today. Stepping with setDate()
  // rather than adding 24h keeps it correct across daylight-saving changes.
  const indexByDay = new Map<string, number>()
  const today = localDayKey(new Date(now))
  for (const cursor = new Date(start); ; cursor.setDate(cursor.getDate() + 1)) {
    const key = localDayKey(cursor)
    indexByDay.set(key, indexByDay.size)
    if (key === today) break
  }

  const rows = handle.db
    .select({ doneAt: items.doneAt })
    .from(items)
    .where(
      and(
        eq(items.status, 'done'),
        isNotNull(items.doneAt),
        gte(items.doneAt, start.getTime()),
        lte(items.doneAt, endOfLocalDay(now))
      )
    )
    .all()

  const counts = new Array<number>(indexByDay.size).fill(0)
  for (const { doneAt } of rows) {
    if (doneAt === null) continue
    const index = indexByDay.get(localDayKey(new Date(doneAt)))
    if (index !== undefined) counts[index] = (counts[index] ?? 0) + 1
  }

  return {
    startDay: localDayKey(start),
    counts,
    total: rows.length
  }
}
