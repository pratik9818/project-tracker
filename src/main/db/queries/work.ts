import { and, asc, desc, eq, isNotNull, lte, ne, or, sql } from 'drizzle-orm'
import type { WorkCounts, WorkItem } from '../../../shared/types'
import type { DatabaseHandle } from '../client'
import { items, projects } from '../schema'

/**
 * The work tracker: Today / Upcoming / All open / Done.
 *
 * These are the only queries that span every project, so each row carries its
 * project name for the label in the list. `projectName: null` means the Inbox.
 *
 * `now` is always a parameter rather than being read inside, so the day
 * boundaries are testable without mocking the clock.
 */

/** Last millisecond of the local day containing `now`. */
export function endOfLocalDay(now: number): number {
  const date = new Date(now)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

/** Every entry can be ticked done, so every entry not yet done is open work. */
const notDone = ne(items.status, 'done')

function selectWorkItems(handle: DatabaseHandle) {
  return handle.db
    .select({
      id: items.id,
      projectId: items.projectId,
      title: items.title,
      content: items.content,
      url: items.url,
      language: items.language,
      filePath: items.filePath,
      createdAt: items.createdAt,
      updatedAt: items.updatedAt,
      status: items.status,
      priority: items.priority,
      dueAt: items.dueAt,
      doneAt: items.doneAt,
      projectName: projects.name
    })
    .from(items)
    .leftJoin(projects, eq(projects.id, items.projectId))
}

/**
 * Today = anything still open that is due today or was due before today.
 *
 * Overdue items sort first because they are ordered by due date ascending, so
 * the most-late thing is at the top where it belongs.
 */
export function todayItems(handle: DatabaseHandle, now: number = Date.now()): WorkItem[] {
  return selectWorkItems(handle)
    .where(and(notDone, isNotNull(items.dueAt), lte(items.dueAt, endOfLocalDay(now))))
    .orderBy(asc(items.dueAt), asc(sql`coalesce(${items.priority}, 99)`), asc(items.id))
    .all()
}

/** Upcoming = still open, with a due date after today. */
export function upcomingItems(handle: DatabaseHandle, now: number = Date.now()): WorkItem[] {
  return selectWorkItems(handle)
    .where(
      and(notDone, isNotNull(items.dueAt), sql`${items.dueAt} > ${endOfLocalDay(now)}`)
    )
    .orderBy(asc(items.dueAt), asc(sql`coalesce(${items.priority}, 99)`), asc(items.id))
    .all()
}

/**
 * All open work, including items with no due date at all — the catch-all so
 * nothing can hide from the tracker.
 *
 * Ordered by priority, then by due date (undated last), then newest first.
 */
export function allOpenItems(handle: DatabaseHandle): WorkItem[] {
  return selectWorkItems(handle)
    .where(and(notDone))
    .orderBy(
      asc(sql`coalesce(${items.priority}, 99)`),
      asc(sql`coalesce(${items.dueAt}, 9e15)`),
      desc(items.createdAt)
    )
    .all()
}

/** Finished work, most recently completed first. */
export function doneItems(handle: DatabaseHandle, limit = 200): WorkItem[] {
  return selectWorkItems(handle)
    .where(and(eq(items.status, 'done')))
    .orderBy(desc(sql`coalesce(${items.doneAt}, ${items.updatedAt})`), desc(items.id))
    .limit(limit)
    .all()
}

/** Badge counts for the sidebar. */
export function workCounts(handle: DatabaseHandle, now: number = Date.now()): WorkCounts {
  const endOfToday = endOfLocalDay(now)

  const tally = (where: ReturnType<typeof and>): number =>
    handle.db
      .select({ n: sql<number>`count(*)` })
      .from(items)
      .where(where)
      .get()?.n ?? 0

  return {
    today: tally(and(notDone, isNotNull(items.dueAt), lte(items.dueAt, endOfToday))),
    upcoming: tally(
      and(notDone, isNotNull(items.dueAt), sql`${items.dueAt} > ${endOfToday}`)
    ),
    open: tally(and(notDone)),
    done: tally(and(eq(items.status, 'done')))
  }
}

/**
 * Overdue count on its own, for the "you are behind" affordance in the sidebar.
 * Due strictly before the start of today.
 */
export function overdueCount(handle: DatabaseHandle, now: number = Date.now()): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  const startOfToday = date.getTime()

  return (
    handle.db
      .select({ n: sql<number>`count(*)` })
      .from(items)
      .where(
        and(
          notDone,
          isNotNull(items.dueAt),
          sql`${items.dueAt} < ${startOfToday}`,
          // Guard against a NULL status slipping through on a malformed row.
          or(eq(items.status, 'open'), eq(items.status, 'doing'))
        )
      )
      .get()?.n ?? 0
  )
}
