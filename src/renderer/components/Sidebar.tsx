import { useState } from 'react'
import type { Project, WorkCounts } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { useAsync } from '@renderer/hooks/useAsync'
import { DeleteProjectDialog } from './DeleteProjectDialog'

/**
 * Scratchpad | Inbox | Today | All Open | Search | Activity | Projects
 *
 * Counts come from the database on every refresh rather than being tracked in
 * the store, so they cannot drift from what the lists actually show.
 */
export function Sidebar(): JSX.Element {
  const { view, setView, dataVersion, refresh } = useAppStore()
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const projects = useAsync<Project[]>(() => window.api.projects.list({}), [dataVersion])
  const counts = useAsync<WorkCounts>(() => window.api.work.counts(), [dataVersion])
  const inbox = useAsync<number>(() => window.api.items.inboxCount(), [dataVersion])

  async function createProject(): Promise<void> {
    const name = newName.trim()
    if (name === '') return
    const project = await window.api.projects.create({ name })
    setNewName('')
    setCreating(false)
    refresh()
    setView({ kind: 'project', projectId: project.id })
  }

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="px-4 py-4">
        <h1 className="text-sm font-semibold tracking-tight text-slate-100">DevVault</h1>
      </div>

      <div className="px-2">
        <NavItem
          label="Scratchpad"
          active={view.kind === 'scratchpad'}
          onClick={() => setView({ kind: 'scratchpad' })}
        />
        <NavItem
          label="Inbox"
          count={inbox.data ?? 0}
          active={view.kind === 'inbox'}
          onClick={() => setView({ kind: 'inbox' })}
        />
        <NavItem
          label="Today"
          count={counts.data?.today ?? 0}
          highlight={(counts.data?.today ?? 0) > 0}
          active={view.kind === 'today'}
          onClick={() => setView({ kind: 'today' })}
        />
        <NavItem
          label="All Open"
          count={counts.data?.open ?? 0}
          active={view.kind === 'allTodos'}
          onClick={() => setView({ kind: 'allTodos' })}
        />
        <NavItem
          label="Search"
          active={view.kind === 'search'}
          onClick={() => setView({ kind: 'search' })}
        />
        <NavItem
          label="Activity"
          active={view.kind === 'activity'}
          onClick={() => setView({ kind: 'activity' })}
        />
      </div>

      <div className="mt-5 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Projects
        </span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-slate-500 hover:text-slate-200"
          aria-label="New project"
        >
          +
        </button>
      </div>

      {creating && (
        <div className="px-2 pb-2">
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createProject()
              if (event.key === 'Escape') {
                setCreating(false)
                setNewName('')
              }
            }}
            onBlur={() => {
              if (newName.trim() === '') setCreating(false)
            }}
            placeholder="Project name"
            className="w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {(projects.data ?? []).map((project) => (
          <div key={project.id} className="group relative">
            <NavItem
              label={project.name}
              muted={project.status !== 'active'}
              active={view.kind === 'project' && view.projectId === project.id}
              onClick={() => setView({ kind: 'project', projectId: project.id })}
            />
            <button
              type="button"
              onClick={() => setDeleting(project)}
              className="absolute right-1 top-1.5 hidden px-1 text-xs text-slate-600 hover:text-rose-400 group-hover:block"
              aria-label={`Delete ${project.name}`}
            >
              ×
            </button>
          </div>
        ))}

        {projects.data !== null && projects.data.length === 0 && (
          <p className="px-2 py-1 text-xs text-slate-600">No projects yet</p>
        )}
      </div>

      {deleting !== null && (
        <DeleteProjectDialog
          project={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            if (view.kind === 'project' && view.projectId === deleting.id) {
              setView({ kind: 'inbox' })
            }
            refresh()
          }}
        />
      )}
    </nav>
  )
}

function NavItem({
  label,
  count,
  active,
  muted,
  highlight,
  onClick
}: {
  label: string
  count?: number
  active: boolean
  muted?: boolean
  highlight?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
        active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
      } ${muted === true ? 'opacity-50' : ''}`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`ml-2 shrink-0 text-[11px] ${highlight === true ? 'text-rose-400' : 'text-slate-500'}`}>
          {count}
        </span>
      )}
    </button>
  )
}
