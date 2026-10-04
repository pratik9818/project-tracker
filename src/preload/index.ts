import { contextBridge, ipcRenderer } from 'electron'
import { EVENTS } from '../shared/ipc'
import type { IpcChannel, IpcInput, IpcOutput } from '../shared/ipc'

/**
 * The ONLY bridge between the renderer and the main process.
 *
 * Two rules it exists to enforce:
 *  1. `ipcRenderer` itself is never exposed. If it were, the page could invoke
 *     any channel with any payload; instead it gets exactly the functions below.
 *  2. No Node API is exposed at all — no fs, no path, no process.
 *
 * Every function is generated from the contract in shared/ipc.ts, so a channel
 * cannot be called with the wrong input or mis-typed on the way back.
 *
 * Only *types* are imported from shared/ipc, never runtime values, so no
 * main-process code is pulled into the preload bundle.
 */
function invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
  return ipcRenderer.invoke(channel, input) as Promise<IpcOutput<C>>
}

const api = {
  health: () => invoke('app:health', undefined),

  projects: {
    list: (input: IpcInput<'projects:list'> = {}) => invoke('projects:list', input),
    get: (input: IpcInput<'projects:get'>) => invoke('projects:get', input),
    create: (input: IpcInput<'projects:create'>) => invoke('projects:create', input),
    rename: (input: IpcInput<'projects:rename'>) => invoke('projects:rename', input),
    setStatus: (input: IpcInput<'projects:setStatus'>) => invoke('projects:setStatus', input),
    /** `mode` is required: the UI must have asked what to do with the items. */
    delete: (input: IpcInput<'projects:delete'>) => invoke('projects:delete', input),
    stats: (input: IpcInput<'projects:stats'>) => invoke('projects:stats', input),
    recent: (input: IpcInput<'projects:recent'>) => invoke('projects:recent', input)
  },

  items: {
    list: (input: IpcInput<'items:list'> = {}) => invoke('items:list', input),
    count: (input: IpcInput<'items:count'> = {}) => invoke('items:count', input),
    get: (input: IpcInput<'items:get'>) => invoke('items:get', input),
    create: (input: IpcInput<'items:create'>) => invoke('items:create', input),
    update: (input: IpcInput<'items:update'>) => invoke('items:update', input),
    delete: (input: IpcInput<'items:delete'>) => invoke('items:delete', input),
    setStatus: (input: IpcInput<'items:setStatus'>) => invoke('items:setStatus', input),
    toggleDone: (input: IpcInput<'items:toggleDone'>) => invoke('items:toggleDone', input),
    move: (input: IpcInput<'items:move'>) => invoke('items:move', input),
    inboxCount: () => invoke('items:inboxCount', undefined)
  },

  tags: {
    list: () => invoke('tags:list', undefined),
    listWithCounts: (input: IpcInput<'tags:listWithCounts'> = {}) =>
      invoke('tags:listWithCounts', input),
    forItem: (input: IpcInput<'tags:forItem'>) => invoke('tags:forItem', input),
    forItems: (input: IpcInput<'tags:forItems'>) => invoke('tags:forItems', input),
    add: (input: IpcInput<'tags:add'>) => invoke('tags:add', input),
    remove: (input: IpcInput<'tags:remove'>) => invoke('tags:remove', input)
  },

  search: {
    query: (input: IpcInput<'search:query'>) => invoke('search:query', input),
    count: (input: IpcInput<'search:count'>) => invoke('search:count', input)
  },

  work: {
    today: () => invoke('work:today', undefined),
    upcoming: () => invoke('work:upcoming', undefined),
    allOpen: () => invoke('work:allOpen', undefined),
    done: (input: IpcInput<'work:done'> = {}) => invoke('work:done', input),
    counts: () => invoke('work:counts', undefined)
  },

  activity: {
    calendar: () => invoke('activity:calendar', undefined)
  },

  capture: {
    save: (input: IpcInput<'capture:save'>) => invoke('capture:save', input),
    close: () => invoke('capture:close', undefined)
  },

  scratchpad: {
    get: () => invoke('scratchpad:get', undefined),
    save: (input: IpcInput<'scratchpad:save'>) => invoke('scratchpad:save', input),
    commit: () => invoke('scratchpad:commit', undefined)
  },

  /**
   * Subscribe to "something changed the database" pushes from the main process.
   *
   * Only this one event is exposed, and the callback receives no payload — the
   * renderer re-queries rather than trusting anything pushed at it. Returns an
   * unsubscribe function so React effects can clean up.
   */
  onDataChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(EVENTS.dataChanged, listener)
    return () => {
      ipcRenderer.removeListener(EVENTS.dataChanged, listener)
    }
  },

  /** Alt+Space was pressed in the main window. No payload, same shape as above. */
  onToggleSearch: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(EVENTS.toggleSearch, listener)
    return () => {
      ipcRenderer.removeListener(EVENTS.toggleSearch, listener)
    }
  }
}

export type DevVaultApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // Unreachable: contextIsolation is always on. Fail loudly rather than
  // silently falling back to an insecure global.
  throw new Error('contextIsolation is disabled — refusing to expose the API')
}
