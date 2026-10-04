import { useState } from 'react'
import type { WorkCounts, WorkItem } from '@shared/types'
import { ItemRow } from '@renderer/components/ItemRow'
import { useAsync } from '@renderer/hooks/useAsync'
import { useItemTags } from '@renderer/hooks/useItemTags'
import { useAppStore } from '@renderer/store/useAppStore'
import { EmptyState, Tabs, ViewHeader } from './shared'

type Bucket = 'today' | 'upcoming' | 'open' | 'done'

/**
 * The work tracker across every project.
 *
 * Each bucket is its own query in the main process rather than one list
 * filtered here, so the ordering rules (most-overdue first, priority then due
 * date, most-recently-completed first) live next to the data.
 */
export function AllTodosView(): JSX.Element {
  const dataVersion = useAppStore((state) => state.dataVersion)
  const [bucket, setBucket] = useState<Bucket>('open')

  const counts = useAsync<WorkCounts>(() => window.api.work.counts(), [dataVersion])
  const items = useAsync<WorkItem[]>(() => {
    switch (bucket) {
      case 'today':
        return window.api.work.today()
      case 'upcoming':
        return window.api.work.upcoming()
      case 'done':
        return window.api.work.done({ limit: 200 })
      case 'open':
        return window.api.work.allOpen()
    }
  }, [dataVersion, bucket])
  const tagsOf = useItemTags(items.data)

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title="All Open" subtitle="Every open entry, in every list, from every project." />

      <Tabs<Bucket>
        active={bucket}
        onChange={setBucket}
        tabs={[
          { id: 'today', label: 'Today', count: counts.data?.today },
          { id: 'upcoming', label: 'Upcoming', count: counts.data?.upcoming },
          { id: 'open', label: 'All open', count: counts.data?.open },
          { id: 'done', label: 'Done', count: counts.data?.done }
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.loading && items.data === null && <EmptyState>Loading…</EmptyState>}
        {items.error !== null && <EmptyState tone="error">{items.error}</EmptyState>}
        {items.data?.length === 0 && <EmptyState>Nothing in this bucket.</EmptyState>}
        {(items.data ?? []).map((item) => (
          <ItemRow key={item.id} item={item} projectName={item.projectName} tags={tagsOf(item.id)} />
        ))}
      </div>
    </div>
  )
}
