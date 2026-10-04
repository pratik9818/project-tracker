import { app, BrowserWindow, ipcMain } from 'electron'
import { EVENTS, IPC_CHANNELS, type IpcChannel, type IpcInput, type IpcOutput } from '../../shared/ipc'
import { parseLine } from '../../shared/parseLine'
import { getDatabase } from '../db'
import { activityCalendar } from '../db/queries/activity'
import {
  countItems,
  createItem,
  deleteItem,
  getItem,
  listItems,
  moveItem,
  setItemStatus,
  toggleItemDone,
  updateItem
} from '../db/queries/items'
import {
  createProject,
  deleteProject,
  getProject,
  inboxCount,
  listProjects,
  recentProjects,
  projectStats,
  renameProject,
  setProjectStatus
} from '../db/queries/projects'
import {
  commitScratchpad,
  getScratchpad,
  saveScratchpad
} from '../db/queries/scratchpad'
import { countSearchResults, searchItems } from '../db/queries/search'
import {
  addTagToItem,
  deleteOrphanedTags,
  listTags,
  listTagsWithCounts,
  removeTagFromItem,
  tagsForItem,
  tagsForItems
} from '../db/queries/tags'
import {
  allOpenItems,
  doneItems,
  todayItems,
  upcomingItems,
  workCounts
} from '../db/queries/work'
import { hideQuickCapture } from '../windows/quickCapture'
import { SCHEMAS } from './schemas'

/**
 * Every IPC handler.
 *
 * The `handle()` wrapper below is the whole security story for this boundary:
 * nothing reaches `db/` until its payload has been through the channel's zod
 * schema, and a thrown error is turned into a clean message instead of leaking
 * a stack trace into the renderer.
 */

const registered = new Set<IpcChannel>()

function handle<C extends IpcChannel>(
  channel: C,
  run: (input: IpcInput<C>) => IpcOutput<C>
): void {
  const schema = SCHEMAS[channel]

  ipcMain.handle(channel, (_event, raw: unknown): IpcOutput<C> => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      // A validation failure is a bug in the renderer, not something a user
      // did. Log the detail here; send a short message across the bridge.
      console.error(`[ipc] invalid payload on ${channel}:`, parsed.error.issues)
      throw new Error(`Invalid request on ${channel}`)
    }
    return run(parsed.data as IpcInput<C>)
  })

  registered.add(channel)
}

export function registerIpcHandlers(): void {
  handle('app:health', () => {
    const { sqlite } = getDatabase()
    const count = (table: 'items' | 'projects'): number =>
      (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

    return {
      electronVersion: process.versions.electron,
      sqliteVersion: (sqlite.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v,
      userDataPath: app.getPath('userData'),
      itemCount: count('items'),
      projectCount: count('projects')
    }
  })

  // --- projects ---------------------------------------------------------
  handle('projects:list', (input) => listProjects(getDatabase(), input))
  handle('projects:get', ({ id }) => getProject(getDatabase(), id))
  handle('projects:create', (input) => createProject(getDatabase(), input))
  handle('projects:rename', ({ id, name }) => renameProject(getDatabase(), id, name))
  handle('projects:setStatus', ({ id, status }) => setProjectStatus(getDatabase(), id, status))
  handle('projects:delete', ({ id, mode }) => deleteProject(getDatabase(), id, mode))
  handle('projects:stats', ({ id }) => projectStats(getDatabase(), id))
  handle('projects:recent', ({ limit }) => recentProjects(getDatabase(), limit))

  // --- items ------------------------------------------------------------
  handle('items:list', (filter) => listItems(getDatabase(), filter))
  handle('items:count', (filter) => countItems(getDatabase(), filter))
  handle('items:get', ({ id }) => getItem(getDatabase(), id))
  handle('items:create', (input) => createItem(getDatabase(), input))
  handle('items:update', ({ id, patch }) => updateItem(getDatabase(), id, patch))
  handle('items:delete', ({ id }) => deleteItem(getDatabase(), id))
  handle('items:setStatus', ({ id, status }) => setItemStatus(getDatabase(), id, status))
  handle('items:toggleDone', ({ id }) => toggleItemDone(getDatabase(), id))
  handle('items:move', ({ id, scope }) => moveItem(getDatabase(), id, scope))
  handle('items:inboxCount', () => inboxCount(getDatabase()))

  // --- tags -------------------------------------------------------------
  handle('tags:list', () => listTags(getDatabase()))
  handle('tags:listWithCounts', ({ scope }) => listTagsWithCounts(getDatabase(), scope))
  handle('tags:forItem', ({ itemId }) => tagsForItem(getDatabase(), itemId))
  handle('tags:forItems', ({ itemIds }) => tagsForItems(getDatabase(), itemIds))
  handle('tags:add', ({ itemId, name }) => addTagToItem(getDatabase(), itemId, name))
  handle('tags:remove', ({ itemId, tagId }) => {
    const handleDb = getDatabase()
    const removed = removeTagFromItem(handleDb, itemId, tagId)
    // Keep the tag filter free of tags nothing uses any more.
    if (removed) deleteOrphanedTags(handleDb)
    return removed
  })

  // --- search -----------------------------------------------------------
  handle('search:query', ({ query, ...options }) => searchItems(getDatabase(), query, options))
  handle('search:count', ({ query, ...options }) =>
    countSearchResults(getDatabase(), query, options)
  )

  // --- work tracker -----------------------------------------------------
  handle('work:today', () => todayItems(getDatabase()))
  handle('work:upcoming', () => upcomingItems(getDatabase()))
  handle('work:allOpen', () => allOpenItems(getDatabase()))
  handle('work:done', ({ limit }) => doneItems(getDatabase(), limit))
  handle('work:counts', () => workCounts(getDatabase()))

  // --- activity ---------------------------------------------------------
  handle('activity:calendar', () => activityCalendar(getDatabase()))

  // --- quick capture ----------------------------------------------------
  handle('capture:save', ({ text }) => {
    // Same line syntax as the Scratchpad: #lists and @schedule.
    const parsed = parseLine(text)
    if (!parsed.actionable) return null

    // Always the Inbox. Quick capture is for getting it out of your head;
    // filing it into a project is a later, deliberate act.
    const item = createItem(getDatabase(), {
      lists: parsed.tags,
      scope: { kind: 'inbox' },
      title: parsed.title,
      dueAt: parsed.dueAt
    })

    // An open main window is showing counts that just went stale.
    broadcastDataChanged()
    return item
  })

  handle('capture:close', () => {
    hideQuickCapture()
  })

  // --- scratchpad -------------------------------------------------------
  handle('scratchpad:get', () => getScratchpad(getDatabase()))
  handle('scratchpad:save', (input) => saveScratchpad(getDatabase(), input))
  handle('scratchpad:commit', () => {
    const result = commitScratchpad(getDatabase())
    if (result.created.length > 0) broadcastDataChanged()
    return result
  })

  assertEveryChannelRegistered()
}

/**
 * Fails at startup if a channel in the contract has no handler. Without this a
 * missing handler would surface only as a rejected promise the first time a
 * user clicked the thing that needed it.
 */
function assertEveryChannelRegistered(): void {
  const missing = IPC_CHANNELS.filter((channel) => !registered.has(channel))
  if (missing.length > 0) {
    throw new Error(`IPC channels declared but not handled: ${missing.join(', ')}`)
  }
}

/**
 * Tells every open window that the database changed.
 *
 * Needed because quick capture writes from its own window: without this, an
 * open main window would keep showing the counts it loaded minutes ago.
 */
export function broadcastDataChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(EVENTS.dataChanged)
  }
}
