import { useEffect, useState } from 'react'
import {
  PROJECT_STATUSES,
  type Item,
  type Project,
  type ProjectStats,
  type ProjectStatus,
  type TagWithCount
} from '@shared/types'
import { Composer } from '@renderer/components/Composer'
import { ItemRow } from '@renderer/components/ItemRow'
import { useAsync } from '@renderer/hooks/useAsync'
import { useItemTags } from '@renderer/hooks/useItemTags'
import { useAppStore } from '@renderer/store/useAppStore'
import { EmptyState, Tabs, ViewHeader } from './shared'

/** How many lists get their own tab; the rest go in the "More" dropdown. */
const VISIBLE_LIST_TABS = 4

/**
 * One project: an "All" tab, then its biggest lists as tabs, and every other
 * list in a "More" dropdown so a project with many tags stays tidy.
 *
 * The lists are not a fixed set — they come from the lists (#todo, #bug,
 * #nottoday...) the project's entries are actually in. Tab ids are the tag id
 * as a string, or 'all'.
 */
export function ProjectView({ projectId }: { projectId: number }): JSX.Element {
  const { dataVersion, refresh } = useAppStore()
  const [tab, setTab] = useState<string>('all')
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')

  const project = useAsync<Project | null>(
    () => window.api.projects.get({ id: projectId }),
    [projectId, dataVersion]
  )
  const stats = useAsync<ProjectStats>(
    () => window.api.projects.stats({ id: projectId }),
    [projectId, dataVersion]
  )
  const lists = useAsync<TagWithCount[]>(
    () => window.api.tags.listWithCounts({ scope: { kind: 'project', projectId } }),
    [projectId, dataVersion]
  )
  // The open tab's list, or null for "All" (or a list that has just emptied).
  const activeList = (lists.data ?? []).find((list) => String(list.id) === tab) ?? null

  // Biggest lists first; ties broken by name so the order does not jump around.
  const byCount = [...(lists.data ?? [])].sort(
    (a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name)
  )
  const tabLists = byCount.slice(0, VISIBLE_LIST_TABS)
  const moreLists = byCount.slice(VISIBLE_LIST_TABS)
  const activeInMore = activeList !== null && moreLists.some((list) => list.id === activeList.id)

  const items = useAsync<Item[]>(
    () =>
      window.api.items.list({
        scope: { kind: 'project', projectId },
        ...(activeList === null ? {} : { tagId: activeList.id }),
        limit: 500
      }),
    [projectId, activeList?.id, dataVersion]
  )
  const tagsOf = useItemTags(items.data)

  useEffect(() => {
    if (project.data !== null) setName(project.data.name)
  }, [project.data])

  // Back to "All" when switching projects — tab ids belong to one project.
  useEffect(() => {
    setTab('all')
  }, [projectId])

  if (project.data === null && !project.loading) {
    return <EmptyState>Project not found.</EmptyState>
  }

  const current = project.data

  async function rename(): Promise<void> {
    if (name.trim() === '' || current === null) return
    await window.api.projects.rename({ id: projectId, name: name.trim() })
    setRenaming(false)
    refresh()
  }

  async function setStatus(status: ProjectStatus): Promise<void> {
    await window.api.projects.setStatus({ id: projectId, status })
    refresh()
  }

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title={current?.name ?? '…'}
        subtitle={current?.repoPath ?? undefined}
        right={
          current !== null && (
            <div className="flex items-center gap-2">
              <StatBadge label="open" value={stats.data?.open ?? 0} tone="open" />
              <StatBadge label="done" value={stats.data?.done ?? 0} tone="done" />
              <StatBadge label="items" value={stats.data?.items ?? 0} />

              <select
                value={current.status}
                onChange={(event) => void setStatus(event.target.value as ProjectStatus)}
                className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
                aria-label="Project status"
              >
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status === 'paused' ? 'paused (archived)' : status}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                Rename
              </button>
            </div>
          )
        }
      />

      {renaming && (
        <div className="border-b border-slate-800 px-4 py-2">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void rename()
              if (event.key === 'Escape') {
                setRenaming(false)
                setName(current?.name ?? '')
              }
            }}
            className="w-64 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
          />
        </div>
      )}

      <Tabs<string>
        active={activeList === null ? 'all' : String(activeList.id)}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'All', count: stats.data?.items ?? 0 },
          ...tabLists.map((list) => ({
            id: String(list.id),
            label: `#${list.name}`,
            count: list.itemCount
          }))
        ]}
        right={
          moreLists.length > 0 && (
            <select
              value={activeInMore ? tab : ''}
              onChange={(event) => setTab(event.target.value === '' ? 'all' : event.target.value)}
              className={`rounded px-2 py-1 text-xs ${
                activeInMore ? 'bg-slate-800 text-slate-100' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
              aria-label="More lists"
            >
              <option value="">More ▾</option>
              {moreLists.map((list) => (
                <option key={list.id} value={String(list.id)}>
                  #{list.name} ({list.itemCount})
                </option>
              ))}
            </select>
          )
        }
      />

      <Composer
        scope={{ kind: 'project', projectId }}
        {...(activeList === null ? {} : { defaultList: activeList.name })}
        placeholder={`Add to ${activeList === null ? (current?.name ?? 'project') : `#${activeList.name}`}…  #list  @due`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.loading && items.data === null && <EmptyState>Loading…</EmptyState>}
        {items.error !== null && <EmptyState tone="error">{items.error}</EmptyState>}
        {items.data?.length === 0 && <EmptyState>Nothing here yet.</EmptyState>}
        {(items.data ?? []).map((item) => (
          <ItemRow key={item.id} item={item} tags={tagsOf(item.id)} />
        ))}
      </div>
    </div>
  )
}

function StatBadge({
  label,
  value,
  tone
}: {
  label: string
  value: number
  tone?: 'open' | 'done'
}): JSX.Element {
  const colour =
    tone === 'open'
      ? 'text-amber-300'
      : tone === 'done'
        ? 'text-emerald-300'
        : 'text-slate-300'

  return (
    <span className="rounded bg-slate-800 px-2 py-1 text-xs">
      <span className={`font-medium ${colour}`}>{value}</span>{' '}
      <span className="text-slate-500">{label}</span>
    </span>
  )
}
