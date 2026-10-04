import type { ActivityCalendar } from '@shared/types'
import { ContributionGraph } from '@renderer/components/ContributionGraph'
import { useAsync } from '@renderer/hooks/useAsync'
import { useAppStore } from '@renderer/store/useAppStore'
import { EmptyState, ViewHeader } from './shared'

/**
 * Your productivity over time: every entry you closed, across all projects and
 * all lists, as a contribution graph. Re-queries on `dataVersion`, so ticking
 * something off elsewhere lights up today's square.
 */
export function ActivityView(): JSX.Element {
  const dataVersion = useAppStore((state) => state.dataVersion)
  const calendar = useAsync<ActivityCalendar>(() => window.api.activity.calendar(), [dataVersion])

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title="Activity" subtitle="What you closed, day by day, across every project." />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {calendar.error !== null && <EmptyState tone="error">{calendar.error}</EmptyState>}
        {calendar.data === null && calendar.error === null && <EmptyState>Loading…</EmptyState>}
        {calendar.data !== null && <ContributionGraph calendar={calendar.data} />}
      </div>
    </div>
  )
}
