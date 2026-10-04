import { eq } from 'drizzle-orm'
import { parseBuffer } from '../../../shared/parseLine'
import type { Item, Scratchpad, ScratchpadCommitResult } from '../../../shared/types'
import type { DatabaseHandle } from '../client'
import { scratchpad } from '../schema'
import { createItem } from './items'

/**
 * The Scratchpad buffer: one row, id = 1.
 *
 * It holds raw text that has not become anything yet. Committing is what turns
 * lines into items — until then a half-written thought stays out of search,
 * out of the counts and out of the work tracker.
 */

const ROW_ID = 1

function now(): number {
  return Date.now()
}

/** Reads the buffer, creating the row on first use. */
export function getScratchpad(handle: DatabaseHandle): Scratchpad {
  const existing = handle.db.select().from(scratchpad).where(eq(scratchpad.id, ROW_ID)).get()
  if (existing !== undefined) {
    return {
      content: existing.content,
      projectId: existing.projectId,
      updatedAt: existing.updatedAt
    }
  }

  const timestamp = now()
  handle.db
    .insert(scratchpad)
    .values({ id: ROW_ID, content: '', projectId: null, updatedAt: timestamp })
    .run()

  return { content: '', projectId: null, updatedAt: timestamp }
}

/**
 * Saves the buffer. Called on a debounce as the user types, so it must stay
 * cheap — one row, one UPDATE.
 */
export function saveScratchpad(
  handle: DatabaseHandle,
  input: { content: string; projectId: number | null }
): Scratchpad {
  getScratchpad(handle) // make sure the row exists

  const timestamp = now()
  handle.db
    .update(scratchpad)
    .set({ content: input.content, projectId: input.projectId, updatedAt: timestamp })
    .where(eq(scratchpad.id, ROW_ID))
    .run()

  return { content: input.content, projectId: input.projectId, updatedAt: timestamp }
}

/**
 * Turns every actionable line into an item, then removes those lines from the
 * buffer.
 *
 * Removing them is what makes commit safe to press twice: what is left is only
 * the blank lines and `//` comments, so nothing can be created a second time.
 *
 * All of it runs in one transaction — a half-committed buffer, where some lines
 * became items and some silently vanished, would be the worst possible outcome.
 */
export function commitScratchpad(
  handle: DatabaseHandle,
  options: { at?: number } = {}
): ScratchpadCommitResult {
  const current = getScratchpad(handle)
  const lines = parseBuffer(current.content, options.at ?? now())

  // Wrapped on the raw connection rather than through Drizzle so createItem's
  // own better-sqlite3 transaction nests as a savepoint instead of opening a
  // second transaction, which SQLite would reject.
  const run = handle.sqlite.transaction((): ScratchpadCommitResult => {
    const created: Item[] = []

    for (const line of lines) {
      if (!line.actionable) continue

      // No #list on the line means createItem files it under DEFAULT_LIST.
      const item = createItem(handle, {
        lists: line.tags,
        scope:
          current.projectId === null
            ? { kind: 'inbox' }
            : { kind: 'project', projectId: current.projectId },
        title: line.title,
        ...(line.dueAt !== null ? { dueAt: line.dueAt } : {})
      })

      created.push(item)
    }

    // Keep the non-actionable lines (blanks and comments) exactly as they were.
    const remaining = lines
      .filter((line) => !line.actionable)
      .map((line) => line.raw)
      .join('\n')
      // Collapse the trailing blank lines a commit tends to leave behind.
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()

    const timestamp = now()
    handle.db
      .update(scratchpad)
      .set({ content: remaining, updatedAt: timestamp })
      .where(eq(scratchpad.id, ROW_ID))
      .run()

    return {
      created,
      content: remaining,
      skipped: lines.filter((line) => !line.actionable && line.raw.trim() !== '').length
    }
  })

  return run()
}
