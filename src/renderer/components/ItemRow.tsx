import { useState } from 'react'
import type { Item, Tag } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { formatDueDate, isOverdue, priorityLabel } from '@renderer/lib/format'
import { Highlighted } from './Highlighted'
import { ItemEditor } from './ItemEditor'

export interface ItemRowProps {
  item: Item
  /** Shown on the right when the list spans projects. null = Inbox. */
  projectName?: string | null
  /** Search-marked title/snippet, when this row came from a search. */
  titleMarked?: string | null
  contentMarked?: string | null
  tags?: Tag[]
}

/**
 * One item in a list.
 *
 * Every entry gets a checkbox — whatever list it is in, it can be done.
 * Clicking the row opens the editor inline rather than navigating away, so the
 * list never loses its place.
 */
export function ItemRow({
  item,
  projectName,
  titleMarked,
  contentMarked,
  tags
}: ItemRowProps): JSX.Element {
  const refresh = useAppStore((state) => state.refresh)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const done = item.status === 'done'

  async function toggleDone(): Promise<void> {
    setBusy(true)
    try {
      await window.api.items.toggleDone({ id: item.id })
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <ItemEditor
        item={item}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          refresh()
        }}
      />
    )
  }

  return (
    <div className="group flex items-start gap-3 border-b border-slate-800/70 px-3 py-2.5 hover:bg-slate-900/60">
      <input
        type="checkbox"
        checked={done}
        disabled={busy}
        onChange={() => void toggleDone()}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-800 accent-emerald-500"
      />

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`truncate text-sm ${done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
          >
            {titleMarked !== undefined && titleMarked !== null ? (
              <Highlighted marked={titleMarked} />
            ) : (
              (item.title ?? <span className="italic text-slate-500">untitled</span>)
            )}
          </span>

          {item.priority !== null && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {priorityLabel(item.priority)}
            </span>
          )}

          {item.dueAt !== null && !done && (
            <span
              className={`text-[11px] ${
                isOverdue(item.dueAt) ? 'font-medium text-rose-400' : 'text-slate-400'
              }`}
            >
              {formatDueDate(item.dueAt)}
            </span>
          )}
        </div>

        {(contentMarked ?? item.content) !== null && (
          <p className="mt-1 truncate text-xs text-slate-400">
            {contentMarked !== undefined && contentMarked !== null ? (
              <Highlighted marked={contentMarked} />
            ) : (
              item.content
            )}
          </p>
        )}

        {item.url !== null && (
          <p className="mt-1 truncate text-xs text-sky-400">{item.url}</p>
        )}

        {tags !== undefined && tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span key={tag.id} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </button>

      {projectName !== undefined && (
        <span className="mt-0.5 shrink-0 text-[11px] text-slate-500">
          {projectName ?? 'Inbox'}
        </span>
      )}
    </div>
  )
}
