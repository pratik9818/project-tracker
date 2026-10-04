import { and, asc, count, desc, eq, getTableColumns, isNull, max, ne, sql } from 'drizzle-orm'
import type {
  CreateProjectInput,
  DeleteProjectMode,
  DeleteProjectResult,
  Project,
  ProjectStats,
  ProjectStatus
} from '../../../shared/types'
import type { DatabaseHandle } from '../client'
import { items, projects } from '../schema'

/**
 * Project CRUD.
 *
 * These functions take the DatabaseHandle explicitly rather than reaching for a
 * module-level singleton. That keeps them trivially testable (pass an in-memory
 * database) and makes the data flow obvious at every call site.
 *
 * Inputs are validated with zod at the IPC boundary (step 7). The cheap
 * invariants that must hold no matter who calls — a project always has a
 * non-empty name — are enforced here too.
 */

function now(): number {
  return Date.now()
}

function requireName(raw: string): string {
  const name = raw.trim()
  if (name.length === 0) throw new Error('Project name cannot be empty')
  return name
}

export function createProject(handle: DatabaseHandle, input: CreateProjectInput): Project {
  const timestamp = now()
  const [row] = handle.db
    .insert(projects)
    .values({
      name: requireName(input.name),
      repoPath: input.repoPath ?? null,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning()
    .all()

  if (row === undefined) throw new Error('Failed to create project')
  return row
}

export function getProject(handle: DatabaseHandle, id: number): Project | null {
  const row = handle.db.select().from(projects).where(eq(projects.id, id)).get()
  return row ?? null
}

/**
 * Projects for the sidebar. Active first, then paused, then done — within each
 * group alphabetically, so the list does not jump around as items change.
 */
export function listProjects(
  handle: DatabaseHandle,
  options: { status?: ProjectStatus } = {}
): Project[] {
  const order = sql`case ${projects.status} when 'active' then 0 when 'paused' then 1 else 2 end`

  const query = handle.db.select().from(projects)
  const rows =
    options.status === undefined
      ? query.orderBy(order, asc(projects.name)).all()
      : query.where(eq(projects.status, options.status)).orderBy(asc(projects.name)).all()

  return rows
}

/**
 * The projects used most recently, for the scratchpad's "save into" picker.
 *
 * "Used" means "had an item created in it": committing the scratchpad creates
 * items, so the project you last committed into comes first. Deriving it from
 * items.created_at needs no extra column and can never drift out of step.
 * A project with no items has never been used, so it does not appear here —
 * the picker's search still finds it.
 */
export function recentProjects(handle: DatabaseHandle, limit: number): Project[] {
  return handle.db
    .select(getTableColumns(projects))
    .from(projects)
    .innerJoin(items, eq(items.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(desc(max(items.createdAt)), asc(projects.name))
    .limit(limit)
    .all()
}

export function renameProject(handle: DatabaseHandle, id: number, name: string): Project {
  const [row] = handle.db
    .update(projects)
    .set({ name: requireName(name), updatedAt: now() })
    .where(eq(projects.id, id))
    .returning()
    .all()

  if (row === undefined) throw new Error(`No project with id ${id}`)
  return row
}

/**
 * Changes a project's status. "Archive" in the UI means status='paused' — an
 * archived project keeps all its items and stays searchable, it just drops to
 * the bottom of the sidebar.
 */
export function setProjectStatus(
  handle: DatabaseHandle,
  id: number,
  status: ProjectStatus
): Project {
  const [row] = handle.db
    .update(projects)
    .set({ status, updatedAt: now() })
    .where(eq(projects.id, id))
    .returning()
    .all()

  if (row === undefined) throw new Error(`No project with id ${id}`)
  return row
}

export function deleteProject(
  handle: DatabaseHandle,
  id: number,
  mode: DeleteProjectMode
): DeleteProjectResult {
  return handle.db.transaction((tx): DeleteProjectResult => {
    const exists = tx.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get()
    if (exists === undefined) throw new Error(`No project with id ${id}`)

    let movedToInbox = 0
    let deletedItems = 0

    if (mode === 'move_to_inbox') {
      // project_id = NULL is the Inbox.
      movedToInbox = tx
        .update(items)
        .set({ projectId: null, updatedAt: now() })
        .where(eq(items.projectId, id))
        .run().changes
    } else {
      // The FTS delete trigger fires per row, keeping the search index correct.
      deletedItems = tx.delete(items).where(eq(items.projectId, id)).run().changes
    }

    tx.delete(projects).where(eq(projects.id, id)).run()
    return { movedToInbox, deletedItems }
  })
}

export function projectStats(handle: DatabaseHandle, id: number): ProjectStats {
  const open =
    handle.db
      .select({ n: count() })
      .from(items)
      .where(and(eq(items.projectId, id), ne(items.status, 'done')))
      .get()?.n ?? 0

  const done =
    handle.db
      .select({ n: count() })
      .from(items)
      .where(and(eq(items.projectId, id), eq(items.status, 'done')))
      .get()?.n ?? 0

  const total =
    handle.db.select({ n: count() }).from(items).where(eq(items.projectId, id)).get()?.n ?? 0

  return { open, done, items: total }
}

/** How many items sit in the Inbox (project_id IS NULL). */
export function inboxCount(handle: DatabaseHandle): number {
  return handle.db.select({ n: count() }).from(items).where(isNull(items.projectId)).get()?.n ?? 0
}
