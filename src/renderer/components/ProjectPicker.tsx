import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types'
import { useAsync } from '@renderer/hooks/useAsync'

/** One row in the picker. `projectId: null` is the Inbox. */
interface Choice {
  projectId: number | null
  name: string
}

const INBOX: Choice = { projectId: null, name: 'Inbox' }
const RECENT_LIMIT = 5

/**
 * "Where should this go?" — opened by Ctrl+S on the scratchpad.
 *
 * With an empty search box it offers the Inbox plus the five most recently
 * used projects, because most of the time you are filing into the same few.
 * Typing filters every project by name. Keyboard first: the box has focus on
 * open, arrows move, Enter picks, Esc cancels.
 *
 * Filtering happens here rather than in SQL: a developer has tens of projects,
 * not thousands, and one list fetched on open is simpler than a query per key.
 */
export function ProjectPicker({
  onPick,
  onClose
}: {
  onPick: (projectId: number | null) => void
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const recent = useAsync<Project[]>(() => window.api.projects.recent({ limit: RECENT_LIMIT }), [])
  const all = useAsync<Project[]>(() => window.api.projects.list({}), [])

  const needle = query.trim().toLowerCase()
  const choices: Choice[] =
    needle === ''
      ? [INBOX, ...(recent.data ?? []).map(toChoice)]
      : [INBOX, ...(all.data ?? []).map(toChoice)].filter((choice) =>
          choice.name.toLowerCase().includes(needle)
        )

  // A new search starts back at the top result.
  useEffect(() => setActiveIndex(0), [needle])

  // Keep the highlighted row in view as the user arrows down.
  useEffect(() => {
    const active = listRef.current?.children[activeIndex]
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (choices.length > 0) setActiveIndex((index) => (index + 1) % choices.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (choices.length > 0) setActiveIndex((index) => (index - 1 + choices.length) % choices.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = choices[activeIndex]
      if (picked !== undefined) onPick(picked.projectId)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[15vh]"
      // Clicking the dimmed backdrop cancels; clicks inside the panel do not.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-700 bg-[#0d1219] font-mono shadow-xl">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="save into which project?"
          spellCheck={false}
          className="w-full border-b border-slate-800 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />

        <div className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-wider text-slate-600">
          {needle === '' ? 'recent' : 'matching'}
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto pb-2" role="listbox">
          {choices.length === 0 ? (
            <div className="px-4 py-2 text-xs text-slate-600">No project matches “{query}”</div>
          ) : (
            choices.map((choice, index) => (
              <button
                key={choice.projectId ?? 'inbox'}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(choice.projectId)}
                className={`block w-full px-4 py-1.5 text-left text-xs ${
                  index === activeIndex ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
                }`}
              >
                {choice.name}
              </button>
            ))
          )}
        </div>

        <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-600">
          ↑↓ move · enter commits here · esc cancels
        </div>
      </div>
    </div>
  )
}

function toChoice(project: Project): Choice {
  return { projectId: project.id, name: project.name }
}
