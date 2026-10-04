import type { WorkItem } from '@shared/types'
import { ItemRow } from '@renderer/components/ItemRow'
import { useAsync } from '@renderer/hooks/useAsync'
import { useItemTags } from '@renderer/hooks/useItemTags'
import { useAppStore } from '@renderer/store/useAppStore'
import { isOverdue } from '@renderer/lib/format'
import { EmptyState, ViewHeader } from './shared'

/**
 * Today = overdue + due today, most overdue first.
 *
 * Overdue items are split into their own section rather than just being sorted
 * first, because "you are late on these" is a different message from "these are
 * for today" and should not be something you have to infer from a date label.
 */
export function TodayView(): JSX.Element {
  const dataVersion = useAppStore((state) => state.dataVersion)
  const items = useAsync<WorkItem[]>(() => window.api.work.today(), [dataVersion])
  const tagsOf = useItemTags(items.data)

  const all = items.data ?? []
  const overdue = all.filter((item) => item.dueAt !== null && isOverdue(item.dueAt))
  const dueToday = all.filter((item) => item.dueAt === null || !isOverdue(item.dueAt))

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title="Today" subtitle="Overdue work and anything due before midnight." />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.loading && items.data === null && <EmptyState>Loading…</EmptyState>}
        {items.error !== null && <EmptyState tone="error">{items.error}</EmptyState>}
        {items.data?.length === 0 && <EmptyState>Nothing due. Clear day.</EmptyState>}

        {overdue.length > 0 && (
          <>
            <SectionLabel tone="danger">
              Overdue · {overdue.length}
            </SectionLabel>
            {overdue.map((item) => (
              <ItemRow key={item.id} item={item} projectName={item.projectName} tags={tagsOf(item.id)} />
            ))}
          </>
        )}

        {dueToday.length > 0 && (
          <>
            <SectionLabel>Due today · {dueToday.length}</SectionLabel>
            {dueToday.map((item) => (
              <ItemRow key={item.id} item={item} projectName={item.projectName} tags={tagsOf(item.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function SectionLabel({
  children,
  tone = 'muted'
}: {
  children: React.ReactNode
  tone?: 'muted' | 'danger'
}): JSX.Element {
  return (
    <div
      className={`sticky top-0 bg-slate-950/95 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide backdrop-blur ${
        tone === 'danger' ? 'text-rose-400' : 'text-slate-500'
      }`}
    >
      {children}
    </div>
  )
}
