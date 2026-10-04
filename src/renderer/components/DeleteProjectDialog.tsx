import { useState } from 'react'
import type { DeleteProjectMode, Project, ProjectStats } from '@shared/types'
import { useAsync } from '@renderer/hooks/useAsync'

/**
 * Deleting a project must never silently take its items with it.
 *
 * The database enforces this (items.project_id is ON DELETE RESTRICT) and the
 * IPC schema requires an explicit mode — this dialog is where the user actually
 * makes that choice. There is no default button: both options are equal weight,
 * and the destructive one is coloured as such.
 */
export function DeleteProjectDialog({
  project,
  onClose,
  onDeleted
}: {
  project: Project
  onClose: () => void
  onDeleted: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stats = useAsync<ProjectStats>(() => window.api.projects.stats({ id: project.id }), [
    project.id
  ])

  const itemCount = stats.data?.items ?? 0

  async function remove(mode: DeleteProjectMode): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.api.projects.delete({ id: project.id, mode })
      onDeleted()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-100">Delete “{project.name}”?</h2>

        {itemCount === 0 ? (
          <p className="mt-2 text-sm text-slate-400">This project has no items.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            It holds{' '}
            <span className="font-medium text-slate-200">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
            . What should happen to them?
          </p>
        )}

        {error !== null && <p className="mt-2 text-xs text-rose-400">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove('move_to_inbox')}
            className="rounded bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Move {itemCount > 0 ? 'them ' : ''}to Inbox, then delete the project
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove('delete_items')}
            className="rounded bg-rose-700 px-3 py-2 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
          >
            Delete the project and {itemCount > 0 ? 'all its items' : 'it'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
