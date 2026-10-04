"use strict";
const electron = require("electron");
const EVENTS = {
  dataChanged: "event:data-changed",
  toggleSearch: "event:toggle-search"
};
function invoke(channel, input) {
  return electron.ipcRenderer.invoke(channel, input);
}
const api = {
  health: () => invoke("app:health", void 0),
  projects: {
    list: (input = {}) => invoke("projects:list", input),
    get: (input) => invoke("projects:get", input),
    create: (input) => invoke("projects:create", input),
    rename: (input) => invoke("projects:rename", input),
    setStatus: (input) => invoke("projects:setStatus", input),
    /** `mode` is required: the UI must have asked what to do with the items. */
    delete: (input) => invoke("projects:delete", input),
    stats: (input) => invoke("projects:stats", input),
    recent: (input) => invoke("projects:recent", input)
  },
  items: {
    list: (input = {}) => invoke("items:list", input),
    count: (input = {}) => invoke("items:count", input),
    get: (input) => invoke("items:get", input),
    create: (input) => invoke("items:create", input),
    update: (input) => invoke("items:update", input),
    delete: (input) => invoke("items:delete", input),
    setStatus: (input) => invoke("items:setStatus", input),
    toggleDone: (input) => invoke("items:toggleDone", input),
    move: (input) => invoke("items:move", input),
    inboxCount: () => invoke("items:inboxCount", void 0)
  },
  tags: {
    list: () => invoke("tags:list", void 0),
    listWithCounts: (input = {}) => invoke("tags:listWithCounts", input),
    forItem: (input) => invoke("tags:forItem", input),
    forItems: (input) => invoke("tags:forItems", input),
    add: (input) => invoke("tags:add", input),
    remove: (input) => invoke("tags:remove", input)
  },
  search: {
    query: (input) => invoke("search:query", input),
    count: (input) => invoke("search:count", input)
  },
  work: {
    today: () => invoke("work:today", void 0),
    upcoming: () => invoke("work:upcoming", void 0),
    allOpen: () => invoke("work:allOpen", void 0),
    done: (input = {}) => invoke("work:done", input),
    counts: () => invoke("work:counts", void 0)
  },
  activity: {
    calendar: () => invoke("activity:calendar", void 0)
  },
  capture: {
    save: (input) => invoke("capture:save", input),
    close: () => invoke("capture:close", void 0)
  },
  scratchpad: {
    get: () => invoke("scratchpad:get", void 0),
    save: (input) => invoke("scratchpad:save", input),
    commit: () => invoke("scratchpad:commit", void 0)
  },
  /**
   * Subscribe to "something changed the database" pushes from the main process.
   *
   * Only this one event is exposed, and the callback receives no payload — the
   * renderer re-queries rather than trusting anything pushed at it. Returns an
   * unsubscribe function so React effects can clean up.
   */
  onDataChanged: (callback) => {
    const listener = () => callback();
    electron.ipcRenderer.on(EVENTS.dataChanged, listener);
    return () => {
      electron.ipcRenderer.removeListener(EVENTS.dataChanged, listener);
    };
  },
  /** Alt+Space was pressed in the main window. No payload, same shape as above. */
  onToggleSearch: (callback) => {
    const listener = () => callback();
    electron.ipcRenderer.on(EVENTS.toggleSearch, listener);
    return () => {
      electron.ipcRenderer.removeListener(EVENTS.toggleSearch, listener);
    };
  }
};
if (process.contextIsolated) {
  electron.contextBridge.exposeInMainWorld("api", api);
} else {
  throw new Error("contextIsolation is disabled — refusing to expose the API");
}
