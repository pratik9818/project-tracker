import { z } from 'zod'
import type { IpcChannel, IpcInput } from '../../shared/ipc'
import { ITEM_STATUSES, PROJECT_STATUSES } from '../../shared/types'

/**
 * zod schemas for every IPC input.
 *
 * The renderer is treated as untrusted: a bug (or anything that got code into
 * the page) must not be able to reach the database with a malformed payload.
 * Every handler parses its input through one of these before touching `db/`.
 *
 * Each schema is declared as `z.ZodType<IpcInput<'channel'>>`, so if the
 * contract in shared/ipc.ts changes and a schema is not updated to match, this
 * file stops compiling. That is what keeps the two in step.
 *
 * The length caps are deliberate. They are far above anything a human types,
 * but they stop a runaway renderer from pushing a multi-hundred-megabyte string
 * into SQLite.
 */

const id = z.number().int().positive()
const timestamp = z.number().int().nonnegative()

const itemStatus = z.enum(ITEM_STATUSES)
const projectStatus = z.enum(PROJECT_STATUSES)

const title = z.string().max(500).nullable().optional()
const content = z.string().max(1_000_000).nullable().optional()
const url = z.string().max(2048).nullable().optional()
const language = z.string().max(32).nullable().optional()
const priority = z.number().int().min(1).max(9).nullable().optional()
/** A list name is a tag name; normalizeTagName() lowercases and strips '#'. */
const listName = z.string().min(1).max(64)

const itemScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('inbox') }),
  z.object({ kind: z.literal('project'), projectId: id })
])

const listItemsFilter = z.object({
  scope: itemScope.optional(),
  statuses: z.array(itemStatus).max(ITEM_STATUSES.length).optional(),
  tagId: id.optional(),
  orderBy: z.enum(['created_desc', 'updated_desc']).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
  offset: z.number().int().nonnegative().optional()
})

const searchInput = z.object({
  query: z.string().max(500),
  scope: itemScope.optional(),
  tagId: id.optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().nonnegative().optional()
})

/**
 * The schema for each channel. Typing the map this way means every channel in
 * the contract must appear here, with a schema producing exactly its input type.
 */
type SchemaMap = { [C in IpcChannel]: z.ZodType<IpcInput<C>> }

export const SCHEMAS: SchemaMap = {
  'app:health': z.void(),

  'projects:list': z.object({ status: projectStatus.optional() }),
  'projects:get': z.object({ id }),
  'projects:create': z.object({
    name: z.string().min(1).max(200),
    repoPath: z.string().max(4096).nullable().optional()
  }),
  'projects:rename': z.object({ id, name: z.string().min(1).max(200) }),
  'projects:setStatus': z.object({ id, status: projectStatus }),
  'projects:delete': z.object({
    id,
    // No default: the caller must have asked the user which one they meant.
    mode: z.enum(['move_to_inbox', 'delete_items'])
  }),
  'projects:stats': z.object({ id }),
  'projects:recent': z.object({ limit: z.number().int().min(1).max(50) }),

  'items:list': listItemsFilter,
  'items:count': listItemsFilter,
  'items:get': z.object({ id }),
  'items:create': z.object({
    lists: z.array(listName).max(50).optional(),
    scope: itemScope.optional(),
    title,
    content,
    url,
    language,
    status: itemStatus.optional(),
    priority,
    dueAt: timestamp.nullable().optional()
  }),
  'items:update': z.object({
    id,
    patch: z.object({
      title,
      content,
      url,
      language,
      priority,
      dueAt: timestamp.nullable().optional()
    })
  }),
  'items:delete': z.object({ id }),
  'items:setStatus': z.object({ id, status: itemStatus }),
  'items:toggleDone': z.object({ id }),
  'items:move': z.object({ id, scope: itemScope }),
  'items:inboxCount': z.void(),

  'tags:list': z.void(),
  'tags:listWithCounts': z.object({ scope: itemScope.optional() }),
  'tags:forItem': z.object({ itemId: id }),
  // Matches the largest page items:list can return.
  'tags:forItems': z.object({ itemIds: z.array(id).max(5000) }),
  'tags:add': z.object({ itemId: id, name: listName }),
  'tags:remove': z.object({ itemId: id, tagId: id }),

  'search:query': searchInput,
  'search:count': searchInput,

  'work:today': z.void(),
  'work:upcoming': z.void(),
  'work:allOpen': z.void(),
  'work:done': z.object({ limit: z.number().int().min(1).max(1000).optional() }),
  'work:counts': z.void(),

  'activity:calendar': z.void(),

  'capture:save': z.object({ text: z.string().max(2000) }),
  'capture:close': z.void(),

  'scratchpad:get': z.void(),
  // Generous but bounded: a scratchpad is a working buffer, not a document store.
  'scratchpad:save': z.object({
    content: z.string().max(200_000),
    projectId: id.nullable()
  }),
  'scratchpad:commit': z.void()
}
