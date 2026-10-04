import { useState } from 'react'
import type { Item, TagWithCount } from '@shared/types'
import { Composer } from '@renderer/components/Composer'
import { ItemRow } from '@renderer/components/ItemRow'
import { useAsync } from '@renderer/hooks/useAsync'
import { useItemTags } from '@renderer/hooks/useItemTags'
import { useAppStore } from '@renderer/store/useAppStore'
import { EmptyState, ViewHeader } from './shared'

/**
 * Capture and browse: everything sitting in the Inbox, newest first, with a
 * filter by list. This is the landing view because capturing is the thing the
 * app is for.
 */
export function InboxView(): JSX.Element {
  const dataVersion = useAppStore((state) => state.dataVersion)
  const [listFilter, setListFilter] = useState<number | 'all'>('all')

  const items = useAsync<Item[]>(
    () =>
      window.api.items.list({
        scope: { kind: 'inbox' },
        ...(listFilter === 'all' ? {} : { tagId: listFilter }),
        limit: 500
      }),
    [dataVersion, listFilter]
  )
  const tagsOf = useItemTags(items.data)

  const lists = useAsync<TagWithCount[]>(
    () => window.api.tags.listWithCounts({ scope: { kind: 'inbox' } }),
    [dataVersion]
  )

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title="Inbox" subtitle="Unfiled captures. Move them into a project when ready." />

      <Composer scope={{ kind: 'inbox' }} />

      <FilterBar listFilter={listFilter} onListChange={setListFilter} lists={lists.data ?? []} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.loading && items.data === null && <EmptyState>Loading…</EmptyState>}
        {items.error !== null && <EmptyState tone="error">{items.error}</EmptyState>}
        {items.data?.length === 0 && (
          <EmptyState>Nothing here. Capture something above.</EmptyState>
        )}
        {(items.data ?? []).map((item) => (
          <ItemRow key={item.id} item={item} tags={tagsOf(item.id)} />
        ))}
      </div>
    </div>
  )
}

export function FilterBar({
  listFilter,
  onListChange,
  lists
}: {
  listFilter: number | 'all'
  onListChange: (value: number | 'all') => void
  lists: TagWithCount[]
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs">
      <select
        value={listFilter}
        onChange={(event) =>
          onListChange(event.target.value === 'all' ? 'all' : Number(event.target.value))
        }
        className="rounded bg-slate-800 px-2 py-1 text-slate-300"
        aria-label="Filter by list"
      >
        <option value="all">All lists</option>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            #{list.name} ({list.itemCount})
          </option>
        ))}
      </select>
    </div>
  )
}
