import type {
  ActivityCalendar,
  CreateItemInput,
  CreateProjectInput,
  DeleteProjectMode,
  DeleteProjectResult,
  Item,
  ItemScope,
  ItemStatus,
  ItemTag,
  ListItemsFilter,
  Project,
  ProjectStats,
  ProjectStatus,
  SearchOptions,
  Scratchpad,
  ScratchpadCommitResult,
  SearchResult,
  Tag,
  TagWithCount,
  UpdateItemInput,
  WorkCounts,
  WorkItem
} from './types'

/**
 * The IPC contract.
 *
 * One table maps every channel to its input and output type. All three sides
 * read from it:
 *   - the preload builds a typed function per channel,
 *   - the main process registers a handler per channel and cannot return the
 *     wrong shape,
 *   - the renderer gets full types through `window.api`.
 *
 * Deliberately no zod here: the renderer imports this file, and anything with a
 * runtime import would be bundled into the renderer too. The zod schemas that
 * validate these inputs live in `main/ipc/schemas.ts`, where the compiler pins
 * each one to the matching `IpcInput<C>`.
 */

export interface HealthReport {
  electronVersion: string
  sqliteVersion: string
  /** Absolute path to the data folder, so the user can find and back it up. */
  userDataPath: string
  itemCount: number
  projectCount: number
}

export interface IpcContract {
  'app:health': { input: void; output: HealthReport }

  'projects:list': { input: { status?: ProjectStatus }; output: Project[] }
  'projects:get': { input: { id: number }; output: Project | null }
  'projects:create': { input: CreateProjectInput; output: Project }
  'projects:rename': { input: { id: number; name: string }; output: Project }
  'projects:setStatus': { input: { id: number; status: ProjectStatus }; output: Project }
  'projects:delete': {
    input: { id: number; mode: DeleteProjectMode }
    output: DeleteProjectResult
  }
  'projects:stats': { input: { id: number }; output: ProjectStats }
  /** Most recently used first — see recentProjects() for what "used" means. */
  'projects:recent': { input: { limit: number }; output: Project[] }

  'items:list': { input: ListItemsFilter; output: Item[] }
  'items:count': { input: ListItemsFilter; output: number }
  'items:get': { input: { id: number }; output: Item | null }
  'items:create': { input: CreateItemInput; output: Item }
  'items:update': { input: { id: number; patch: UpdateItemInput }; output: Item }
  'items:delete': { input: { id: number }; output: boolean }
  'items:setStatus': { input: { id: number; status: ItemStatus }; output: Item }
  'items:toggleDone': { input: { id: number }; output: Item }
  'items:move': { input: { id: number; scope: ItemScope }; output: Item }
  'items:inboxCount': { input: void; output: number }

  'tags:list': { input: void; output: Tag[] }
  /** Lists in use, with counts. `scope` narrows to one project or the Inbox. */
  'tags:listWithCounts': { input: { scope?: ItemScope }; output: TagWithCount[] }
  'tags:forItem': { input: { itemId: number }; output: Tag[] }
  /** Tags for a whole screen of rows in one round trip. */
  'tags:forItems': { input: { itemIds: number[] }; output: ItemTag[] }
  'tags:add': { input: { itemId: number; name: string }; output: Tag }
  'tags:remove': { input: { itemId: number; tagId: number }; output: boolean }

  'search:query': { input: { query: string } & SearchOptions; output: SearchResult[] }
  'search:count': { input: { query: string } & SearchOptions; output: number }

  'work:today': { input: void; output: WorkItem[] }
  'work:upcoming': { input: void; output: WorkItem[] }
  'work:allOpen': { input: void; output: WorkItem[] }
  'work:done': { input: { limit?: number }; output: WorkItem[] }
  'work:counts': { input: void; output: WorkCounts }

  /** Entries closed per day over the last year, for the contribution graph. */
  'activity:calendar': { input: void; output: ActivityCalendar }

  /** Quick capture: one line in, one item out. null = nothing worth saving. */
  'capture:save': { input: { text: string }; output: Item | null }
  /** Dismiss the quick-capture window without saving. */
  'capture:close': { input: void; output: void }

  'scratchpad:get': { input: void; output: Scratchpad }
  'scratchpad:save': {
    input: { content: string; projectId: number | null }
    output: Scratchpad
  }
  'scratchpad:commit': { input: void; output: ScratchpadCommitResult }
}

/**
 * Pushes from main to renderer. Unlike the channels above these are one-way and
 * carry no payload — the renderer re-queries when it hears one.
 *
 * `dataChanged` fires when something outside the current window wrote to the
 * database (a quick capture, say), so an open main window does not sit there
 * showing stale counts.
 *
 * `toggleSearch` is Alt+Space in the main window. It has to come from main:
 * Windows opens its window menu on Alt+Space before the page ever sees the key,
 * so main claims it as a hotkey while the window is focused (shortcuts.ts).
 */
export const EVENTS = {
  dataChanged: 'event:data-changed',
  toggleSearch: 'event:toggle-search'
} as const

export type IpcChannel = keyof IpcContract
export type IpcInput<C extends IpcChannel> = IpcContract[C]['input']
export type IpcOutput<C extends IpcChannel> = IpcContract[C]['output']

/**
 * Every channel name, as a runtime array.
 *
 * Used by the main process to assert at startup that a handler exists for each
 * one — a missing handler would otherwise only show up as a rejected promise
 * the first time a user clicked something.
 */
export const IPC_CHANNELS = [
  'app:health',
  'projects:list',
  'projects:get',
  'projects:create',
  'projects:rename',
  'projects:setStatus',
  'projects:delete',
  'projects:stats',
  'projects:recent',
  'items:list',
  'items:count',
  'items:get',
  'items:create',
  'items:update',
  'items:delete',
  'items:setStatus',
  'items:toggleDone',
  'items:move',
  'items:inboxCount',
  'tags:list',
  'tags:listWithCounts',
  'tags:forItem',
  'tags:forItems',
  'tags:add',
  'tags:remove',
  'search:query',
  'search:count',
  'work:today',
  'work:upcoming',
  'work:allOpen',
  'work:done',
  'work:counts',
  'activity:calendar',
  'capture:save',
  'capture:close',
  'scratchpad:get',
  'scratchpad:save',
  'scratchpad:commit'
] as const satisfies readonly IpcChannel[]

/**
 * Compile-time check that IPC_CHANNELS covers every channel in the contract.
 * If a channel is added above and not listed here, this line stops compiling.
 */
type MissingChannels = Exclude<IpcChannel, (typeof IPC_CHANNELS)[number]>
export type AssertNoMissingChannels = MissingChannels extends never ? true : MissingChannels
