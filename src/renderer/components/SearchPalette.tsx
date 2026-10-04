import { useEffect, useRef, useState } from 'react'
import type { Item, Project, SearchResult } from '@shared/types'
import { useAsync, useDebounced } from '@renderer/hooks/useAsync'
import { useAppStore } from '@renderer/store/useAppStore'
import { Highlighted } from './Highlighted'
import { ItemEditor } from './ItemEditor'

const PROJECT_LIMIT = 5
const ITEM_LIMIT = 30

/** One selectable row. Projects and items share one list so the arrows walk both. */
type Row = { kind: 'project'; project: Project } | { kind: 'item'; result: SearchResult }

/**
 * Alt+Space: search everything from anywhere in the app.
 *
 * Mounted once in App and listens for its own hotkey, so no view needs to know
 * it exists. Projects match by name (filtered here — there are only tens of
 * them); items go through the same FTS5 search as the Search view.
 *
 * Picking a project navigates to it. Picking an item opens the existing editor
 * inside the palette, because items have no page of their own; Esc goes back to
 * the results rather than closing, so you can check several in a row.
 */
export function SearchPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false)

  // Alt+Space is claimed by the main process (bindSearchPaletteShortcut in
  // shortcuts.ts) because Windows would otherwise open its window menu.
  useEffect(() => window.api.onToggleSearch(() => setOpen((current) => !current)), [])

  if (!open) return null
  return <Palette onClose={() => setOpen(false)} />
}

/** The open palette. A separate component so its state resets on every open. */
function Palette({ onClose }: { onClose: () => void }): JSX.Element {
  const setView = useAppStore((state) => state.setView)
  const refresh = useAppStore((state) => state.refresh)
  const dataVersion = useAppStore((state) => state.dataVersion)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [editing, setEditing] = useState<Item | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const debounced = useDebounced(query.trim(), 80)

  const projects = useAsync<Project[]>(() => window.api.projects.list({}), [dataVersion])
  const results = useAsync<SearchResult[]>(
    () =>
      debounced === ''
        ? Promise.resolve([])
        : window.api.search.query({ query: debounced, limit: ITEM_LIMIT }),
    [debounced, dataVersion]
  )

  const needle = debounced.toLowerCase()
  const matchingProjects =
    needle === ''
      ? []
      : (projects.data ?? [])
          .filter((project) => project.name.toLowerCase().includes(needle))
          .slice(0, PROJECT_LIMIT)

  const rows: Row[] = [
    ...matchingProjects.map((project): Row => ({ kind: 'project', project })),
    ...(results.data ?? []).map((result): Row => ({ kind: 'item', result }))
  ]

  const projectNames = new Map((projects.data ?? []).map((project) => [project.id, project.name]))

  // A new search starts back at the top result.
  useEffect(() => setActiveIndex(0), [debounced])

  // Keep the highlighted row in view as the user arrows down.
  useEffect(() => {
    const active = listRef.current?.querySelector(`[data-row="${activeIndex}"]`)
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function pick(row: Row): void {
    if (row.kind === 'project') {
      setView({ kind: 'project', projectId: row.project.id })
      onClose()
    } else {
      setEditing(row.result.item)
    }
  }

  function backToResults(): void {
    setEditing(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (rows.length > 0) setActiveIndex((index) => (index + 1) % rows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (rows.length > 0) setActiveIndex((index) => (index - 1 + rows.length) % rows.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[activeIndex]
      if (row !== undefined) pick(row)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[12vh]"
      // Clicking the dimmed backdrop closes; clicks inside the panel do not.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-700 bg-[#0d1219] shadow-xl">
        {editing !== null ? (
          // ItemEditor handles Esc itself by calling onClose — here that means
          // "back to the results", not "close the palette".
          <ItemEditor
            item={editing}
            onClose={backToResults}
            onSaved={() => {
              refresh()
              backToResults()
            }}
          />
        ) : (
          <>
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="search notes, todos, bugs, snippets, projects…"
              spellCheck={false}
              className="w-full border-b border-slate-800 bg-transparent px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
              {debounced === '' ? (
                <Hint>Type to search everything.</Hint>
              ) : rows.length === 0 && !results.loading ? (
                <Hint>Nothing matches “{debounced}”.</Hint>
              ) : (
                rows.map((row, index) => (
                  <button
                    key={row.kind === 'project' ? `p${row.project.id}` : `i${row.result.item.id}`}
                    type="button"
                    data-row={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(row)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                      index === activeIndex ? 'bg-slate-800' : ''
                    }`}
                  >
                    {row.kind === 'project' ? (
                      <>
                        <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                          project
                        </span>
                        <span className="truncate text-sm text-slate-100">{row.project.name}</span>
                      </>
                    ) : (
                      <ItemRowContent
                        result={row.result}
                        projectName={
                          row.result.item.projectId === null
                            ? 'Inbox'
                            : projectNames.get(row.result.item.projectId) ?? ''
                        }
                      />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-slate-800 px-4 py-2 font-mono text-[10px] text-slate-600">
              ↑↓ move · enter opens · esc closes
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ItemRowContent({
  result,
  projectName
}: {
  result: SearchResult
  projectName: string
}): JSX.Element {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-100">
          {result.titleMarked !== null ? (
            <Highlighted marked={result.titleMarked} />
          ) : (
            (result.item.title ?? <span className="italic text-slate-500">untitled</span>)
          )}
        </span>
        {result.contentMarked !== null && (
          <span className="block truncate text-xs text-slate-500">
            <Highlighted marked={result.contentMarked} />
          </span>
        )}
      </span>
      <span className="shrink-0 text-[11px] text-slate-500">{projectName}</span>
    </>
  )
}

function Hint({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="px-4 py-3 text-xs text-slate-600">{children}</div>
}
