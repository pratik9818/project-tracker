import { useRef, useState } from 'react'
import { parseLine } from '@shared/parseLine'
import type { ItemScope } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'

/**
 * The "capture something" box at the top of a list.
 *
 * One line, Enter to save. It reads the line with the same parser as the
 * Scratchpad, so `#bug crash on save @fri` means the same thing everywhere:
 * `#` names the list(s), `@` schedules.
 *
 * `defaultList` is the list a line goes into when it names none — the project
 * tab you are looking at, so what you add stays on screen. Without one, the
 * data layer falls back to DEFAULT_LIST.
 */
export function Composer({
  scope,
  defaultList,
  placeholder = 'Capture anything…  #list  @due'
}: {
  scope: ItemScope
  defaultList?: string
  placeholder?: string
}): JSX.Element {
  const refresh = useAppStore((state) => state.refresh)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function create(): Promise<void> {
    const parsed = parseLine(text)
    if (!parsed.actionable || saving) return

    const lists = parsed.tags.length > 0 || defaultList === undefined ? parsed.tags : [defaultList]

    setSaving(true)
    setError(null)
    try {
      await window.api.items.create({
        lists,
        scope: scope.kind === 'all' ? { kind: 'inbox' } : scope,
        title: parsed.title,
        dueAt: parsed.dueAt
      })
      setText('')
      refresh()
      inputRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create()
          }}
          placeholder={placeholder}
          data-composer
          className="flex-1 rounded bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
        />

        <button
          type="button"
          onClick={() => void create()}
          disabled={saving || text.trim() === ''}
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {error !== null && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}
    </div>
  )
}
