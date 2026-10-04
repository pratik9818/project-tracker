import { useEffect, useRef, useState } from 'react'
import type { SearchResult, TagWithCount } from '@shared/types'
import { ItemRow } from '@renderer/components/ItemRow'
import { useAsync, useDebounced } from '@renderer/hooks/useAsync'
import { useItemTags } from '@renderer/hooks/useItemTags'
import { useAppStore } from '@renderer/store/useAppStore'
import { EmptyState, ViewHeader } from './shared'

/**
 * Full-text search across everything.
 *
 * Debounced by 80ms — short enough to feel live while typing, long enough that
 * a fast typist does not fire a query per keystroke. The results themselves
 * come back in single-digit milliseconds even at 10k items, so the debounce is
 * about not wasting work, not about hiding latency.
 */
export function SearchView(): JSX.Element {
  const { searchQuery, setSearchQuery, dataVersion } = useAppStore()
  const [listFilter, setListFilter] = useState<number | 'all'>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounced = useDebounced(searchQuery, 80)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filter = listFilter === 'all' ? {} : { tagId: listFilter }

  const results = useAsync<SearchResult[]>(
    () => window.api.search.query({ query: debounced, ...filter, limit: 100 }),
    [debounced, listFilter, dataVersion]
  )
  const tagsOf = useItemTags(results.data?.map((result) => result.item) ?? null)

  const total = useAsync<number>(
    () => window.api.search.count({ query: debounced, ...filter }),
    [debounced, listFilter, dataVersion]
  )

  const lists = useAsync<TagWithCount[]>(() => window.api.tags.listWithCounts(), [dataVersion])

  const shown = results.data?.length ?? 0

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title="Search" subtitle="Title and body, across every project and the Inbox." />

      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search everything…"
          data-search-input
          className="flex-1 rounded bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
        />
        <select
          value={listFilter}
          onChange={(event) =>
            setListFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
          }
          className="rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-300"
          aria-label="Filter by list"
        >
          <option value="all">All lists</option>
          {(lists.data ?? []).map((list) => (
            <option key={list.id} value={list.id}>
              #{list.name}
            </option>
          ))}
        </select>
      </div>

      {debounced.trim() !== '' && total.data !== null && (
        <p className="border-b border-slate-800 px-4 py-1.5 text-[11px] text-slate-500">
          {total.data === 0
            ? 'No matches'
            : shown < total.data
              ? `Showing ${shown} of ${total.data} matches`
              : `${total.data} ${total.data === 1 ? 'match' : 'matches'}`}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searchQuery.trim() === '' && (
          <EmptyState>Start typing. Prefix matching means “expo” already finds “export”.</EmptyState>
        )}
        {results.error !== null && <EmptyState tone="error">{results.error}</EmptyState>}
        {(results.data ?? []).map((result) => (
          <ItemRow
            key={result.item.id}
            item={result.item}
            titleMarked={result.titleMarked}
            contentMarked={result.contentMarked}
            tags={tagsOf(result.item.id)}
          />
        ))}
      </div>
    </div>
  )
}
