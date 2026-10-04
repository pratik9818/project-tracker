import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  type Item,
  type SearchOptions,
  type SearchResult
} from '../../../shared/types'
import type { DatabaseHandle } from '../client'

/**
 * Full-text search over items, backed by the FTS5 table in
 * drizzle/0001_fts.sql.
 *
 * Written against the raw better-sqlite3 handle because Drizzle cannot express
 * MATCH, bm25() or highlight(). Everything user-supplied is still bound as a
 * parameter — nothing is interpolated into SQL.
 */

/**
 * Turns what the user typed into a safe FTS5 query.
 *
 * Raw input cannot be passed through: characters like `"`, `*`, `:`, `^`, `(`
 * and the bare words AND/OR/NOT are FTS5 operators, so a half-typed query would
 * throw a syntax error on almost every keystroke.
 *
 * So each run of word characters becomes a quoted phrase with a `*` appended.
 * Quoting neutralises every operator, and the `*` gives prefix matching, which
 * is what makes search feel instant while typing: "expo" already finds
 * "export". Multiple terms are implicitly ANDed by FTS5.
 */
export function buildMatchQuery(input: string): string | null {
  const tokens = input
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((token) => token.length > 0)
    // A double quote is the only character that needs escaping inside a
    // quoted phrase, and it is escaped by doubling it.
    .map((token) => `"${token.replace(/"/g, '""')}"*`)

  if (tokens.length === 0) return null
  return tokens.join(' ')
}

interface SearchRow {
  id: number
  project_id: number | null
  title: string | null
  content: string | null
  url: string | null
  language: string | null
  file_path: string | null
  created_at: number
  updated_at: number
  status: Item['status']
  priority: number | null
  due_at: number | null
  done_at: number | null
  title_marked: string | null
  content_marked: string | null
  score: number
}

function toItem(row: SearchRow): Item {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    url: row.url,
    language: row.language,
    filePath: row.file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    doneAt: row.done_at
  }
}

/** Builds the scope/list filters shared by searchItems and countSearchResults. */
function buildFilters(options: SearchOptions): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  const scope = options.scope ?? { kind: 'all' }
  if (scope.kind === 'inbox') {
    clauses.push('i.project_id IS NULL')
  } else if (scope.kind === 'project') {
    clauses.push('i.project_id = ?')
    params.push(scope.projectId)
  }

  if (options.tagId !== undefined) {
    clauses.push('EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)')
    params.push(options.tagId)
  }

  return { sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '', params }
}

export function searchItems(
  handle: DatabaseHandle,
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const match = buildMatchQuery(query)
  if (match === null) return []

  const filters = buildFilters(options)
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  // highlight() marks the whole title; snippet() returns ~14 tokens of body
  // around the best-matching run, with an ellipsis where it was cut.
  const rows = handle.sqlite
    .prepare<unknown[], SearchRow>(
      `SELECT
         i.*,
         highlight(items_fts, 0, ?, ?) AS title_marked,
         snippet(items_fts, 1, ?, ?, '…', 14) AS content_marked,
         bm25(items_fts) AS score
       FROM items_fts
       JOIN items i ON i.id = items_fts.rowid
       WHERE items_fts MATCH ?${filters.sql}
       ORDER BY score
       LIMIT ? OFFSET ?`
    )
    .all(
      HIGHLIGHT_START,
      HIGHLIGHT_END,
      HIGHLIGHT_START,
      HIGHLIGHT_END,
      match,
      ...filters.params,
      limit,
      offset
    )

  return rows.map((row) => ({
    item: toItem(row),
    titleMarked: row.title_marked,
    contentMarked: row.content_marked,
    score: row.score
  }))
}

/** Total matches, so the UI can say "showing 50 of 231". */
export function countSearchResults(
  handle: DatabaseHandle,
  query: string,
  options: SearchOptions = {}
): number {
  const match = buildMatchQuery(query)
  if (match === null) return 0

  const filters = buildFilters(options)

  return (
    handle.sqlite
      .prepare<unknown[], { n: number }>(
        `SELECT count(*) AS n
         FROM items_fts
         JOIN items i ON i.id = items_fts.rowid
         WHERE items_fts MATCH ?${filters.sql}`
      )
      .get(match, ...filters.params)?.n ?? 0
  )
}
