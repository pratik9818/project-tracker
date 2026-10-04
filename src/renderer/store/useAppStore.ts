import { create } from 'zustand'

/**
 * UI state only — deliberately tiny.
 *
 * Nothing that lives in SQLite is cached here. Views fetch what they need
 * through `window.api` and re-fetch when `dataVersion` changes. That keeps one
 * source of truth (the database) and avoids a second, stale copy in the
 * renderer that would have to be kept in sync by hand.
 */

export type View =
  | { kind: 'scratchpad' }
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'allTodos' }
  | { kind: 'search' }
  | { kind: 'activity' }
  | { kind: 'project'; projectId: number }

interface AppState {
  view: View
  setView: (view: View) => void

  searchQuery: string
  setSearchQuery: (query: string) => void

  /**
   * Bumped after every write. Views depend on it, so one call refreshes
   * whatever is on screen without each view knowing about the others.
   */
  dataVersion: number
  refresh: () => void
}

export const useAppStore = create<AppState>((set) => ({
  // The Scratchpad is the landing view: the app opens ready to be typed into,
  // not showing you a list of things you already captured.
  view: { kind: 'scratchpad' },
  setView: (view) => set({ view }),

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  dataVersion: 0,
  refresh: () => set((state) => ({ dataVersion: state.dataVersion + 1 }))
}))
