/**
 * The domain contract: entities, the inputs that change them, and the shapes
 * that cross the IPC bridge.
 *
 * This file must stay free of runtime imports from `electron`,
 * `better-sqlite3`, `drizzle-orm` or `zod` — all three sides of the app
 * (main, preload, renderer) import it, so anything in here ends up in the
 * renderer bundle too.
 *
 * Timestamps are Unix milliseconds (`Date.now()`), stored as SQLite INTEGER.
 * Milliseconds rather than seconds so the renderer can do `new Date(ms)` with
 * no conversion step.
 */

/**
 * There are no item types. Every item is an entry in one or more lists, and a
 * list is just a tag: `#todo`, `#bug`, `#nottoday`, whatever the user types.
 * An entry typed with no list at all goes into this one.
 */
export const DEFAULT_LIST = 'todo'

export const ITEM_STATUSES = ['open', 'doing', 'done'] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export const PROJECT_STATUSES = ['active', 'paused', 'done'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Project {
  id: number
  name: string
  repoPath: string | null
  status: ProjectStatus
  createdAt: number
  updatedAt: number
}

export interface Item {
  id: number
  /** null means the item lives in the Inbox. */
  projectId: number | null
  title: string | null
  content: string | null
  /** Optional link attached to the entry. */
  url: string | null
  /** Optional code language when the content is a snippet, e.g. "ts", "sql". */
  language: string | null
  /** Optional attached file (Phase 2). Relative to userData/attachments/. */
  filePath: string | null
  createdAt: number
  updatedAt: number
  /** Always set by createItem(); nullable only at the column level. */
  status: ItemStatus | null
  /** Lower number = more urgent. 1..3 by convention. */
  priority: number | null
  dueAt: number | null
  doneAt: number | null
}

export interface Tag {
  id: number
  name: string
}

/** One item–tag link, as returned when loading tags for many items at once. */
export interface ItemTag extends Tag {
  itemId: number
}

export interface TagWithCount extends Tag {
  itemCount: number
}

// ---------------------------------------------------------------------------
// Where an item lives
// ---------------------------------------------------------------------------

/**
 * Explicit, so "no filter" can never be confused with "the Inbox" — which is
 * what `project_id IS NULL` would otherwise mean ambiguously.
 */
export type ItemScope =
  | { kind: 'all' }
  | { kind: 'inbox' }
  | { kind: 'project'; projectId: number }

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  name: string
  repoPath?: string | null
}

export interface CreateItemInput {
  /** List names (tags) to file the entry under. Empty or omitted = DEFAULT_LIST. */
  lists?: readonly string[]
  /** Defaults to the Inbox. */
  scope?: ItemScope
  title?: string | null
  content?: string | null
  url?: string | null
  language?: string | null
  /** Defaults to 'open'. */
  status?: ItemStatus
  priority?: number | null
  dueAt?: number | null
}

/** Every field a user can edit. Omitted keys are left unchanged. */
export interface UpdateItemInput {
  title?: string | null
  content?: string | null
  url?: string | null
  language?: string | null
  priority?: number | null
  dueAt?: number | null
}

export interface ListItemsFilter {
  scope?: ItemScope
  statuses?: readonly ItemStatus[]
  tagId?: number
  orderBy?: 'created_desc' | 'updated_desc'
  limit?: number
  offset?: number
}

/**
 * What to do with a project's items when the project is deleted. There is no
 * default on purpose: the caller must have asked the user, because the database
 * itself refuses to drop a project that still owns items.
 */
export type DeleteProjectMode = 'move_to_inbox' | 'delete_items'

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Quick stats for the project page header: open vs. done work. */
export interface ProjectStats {
  /** Entries not yet done. */
  open: number
  /** Entries marked done. */
  done: number
  /** Every entry in the project. */
  items: number
}

export interface DeleteProjectResult {
  movedToInbox: number
  deletedItems: number
}

/** An item in the cross-project work tracker, labelled with its project. */
export interface WorkItem extends Item {
  /** null = the item is in the Inbox. */
  projectName: string | null
}

export interface WorkCounts {
  today: number
  upcoming: number
  open: number
  done: number
}

/**
 * The contribution graph: entries closed per local day over the last year.
 *
 * `counts[0]` is `startDay` (always a Sunday) and each following element is
 * the next day, ending with today. Laid out 7 to a column, that is the grid.
 */
export interface ActivityCalendar {
  /** `YYYY-MM-DD`, local. */
  startDay: string
  counts: number[]
  /** Sum of `counts`. */
  total: number
}

export interface SearchOptions {
  scope?: ItemScope
  tagId?: number
  limit?: number
  offset?: number
}

export interface SearchResult {
  item: Item
  /**
   * Title and a snippet of the body, with matched spans wrapped in
   * HIGHLIGHT_START/HIGHLIGHT_END. Use splitHighlights() to render them.
   */
  titleMarked: string | null
  contentMarked: string | null
  /** bm25 relevance. Lower is a better match; results are already sorted. */
  score: number
}

/** The Scratchpad buffer: raw text that has not become items yet. */
export interface Scratchpad {
  content: string
  /** Where committed lines get filed. null = Inbox. */
  projectId: number | null
  updatedAt: number
}

export interface ScratchpadCommitResult {
  created: Item[]
  /** The buffer after the committed lines were removed. */
  content: string
  /** Lines left behind because they were comments. */
  skipped: number
}

// ---------------------------------------------------------------------------
// Search highlighting
// ---------------------------------------------------------------------------

/**
 * The main process marks matched spans with these two control characters
 * instead of returning HTML. The renderer splits on them and renders real React
 * elements, so a match inside user text can never inject markup. They are
 * non-printable, so they will not collide with anything a user typed.
 */
export const HIGHLIGHT_START = '\u0002'
export const HIGHLIGHT_END = '\u0003'

export interface HighlightSegment {
  text: string
  /** True if this span matched the search query. */
  match: boolean
}

/** Turns marked-up text from FTS5 into alternating plain/matched segments. */
export function splitHighlights(marked: string): HighlightSegment[] {
  const segments: HighlightSegment[] = []
  let rest = marked

  while (rest.length > 0) {
    const start = rest.indexOf(HIGHLIGHT_START)
    if (start === -1) {
      segments.push({ text: rest, match: false })
      break
    }
    if (start > 0) segments.push({ text: rest.slice(0, start), match: false })

    const end = rest.indexOf(HIGHLIGHT_END, start)
    if (end === -1) {
      // Unbalanced marker: treat the remainder as plain text rather than throw.
      segments.push({ text: rest.slice(start + 1), match: false })
      break
    }
    segments.push({ text: rest.slice(start + 1, end), match: true })
    rest = rest.slice(end + 1)
  }

  return segments.filter((segment) => segment.text.length > 0)
}
