import { useEffect } from 'react'
import { SearchPalette } from './components/SearchPalette'
import { Sidebar } from './components/Sidebar'
import { useAppStore } from './store/useAppStore'
import { useShortcuts } from './hooks/useShortcuts'
import { ActivityView } from './views/ActivityView'
import { AllTodosView } from './views/AllTodosView'
import { InboxView } from './views/InboxView'
import { ProjectView } from './views/ProjectView'
import { ScratchpadView } from './views/ScratchpadView'
import { SearchView } from './views/SearchView'
import { TodayView } from './views/TodayView'

/**
 * The app shell: sidebar on the left, the current view on the right.
 *
 * Routing is a tagged union in the store rather than a router library — there
 * are five destinations and no URLs to speak of in a desktop app, so a router
 * would be machinery without a job.
 */
export function App(): JSX.Element {
  const view = useAppStore((state) => state.view)
  const refresh = useAppStore((state) => state.refresh)
  useShortcuts()

  // A quick capture writes from its own window, so this window has to be told
  // to re-query — otherwise the counts and lists here go quietly stale.
  useEffect(() => window.api.onDataChanged(refresh), [refresh])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">{renderView(view)}</main>
      <SearchPalette />
    </div>
  )
}

function renderView(view: ReturnType<typeof useAppStore.getState>['view']): JSX.Element {
  switch (view.kind) {
    case 'scratchpad':
      return <ScratchpadView />
    case 'inbox':
      return <InboxView />
    case 'today':
      return <TodayView />
    case 'allTodos':
      return <AllTodosView />
    case 'search':
      return <SearchView />
    case 'activity':
      return <ActivityView />
    case 'project':
      // Keyed so switching projects remounts the view and resets its tab
      // state, instead of showing the previous project's tab mid-load.
      return <ProjectView key={view.projectId} projectId={view.projectId} />
  }
}
