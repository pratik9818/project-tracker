import { useMemo } from 'react'
import type { Item, ItemTag, Tag } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { useAsync } from './useAsync'

const NO_TAGS: Tag[] = []

/**
 * The list chips for a screen of rows: one IPC call for all of them, then a
 * lookup per row. Re-runs when the set of items or the data changes.
 *
 *   const tagsOf = useItemTags(items.data)
 *   <ItemRow item={item} tags={tagsOf(item.id)} />
 */
export function useItemTags(items: readonly Item[] | null): (itemId: number) => Tag[] {
  const dataVersion = useAppStore((state) => state.dataVersion)
  const ids = useMemo(() => (items ?? []).map((item) => item.id), [items])

  const links = useAsync<ItemTag[]>(
    () => (ids.length === 0 ? Promise.resolve([]) : window.api.tags.forItems({ itemIds: ids })),
    // Joined so the effect re-runs on a different set of ids, not a new array.
    [ids.join(','), dataVersion]
  )

  const byItem = useMemo(() => {
    const map = new Map<number, Tag[]>()
    for (const { itemId, id, name } of links.data ?? []) {
      const list = map.get(itemId) ?? []
      list.push({ id, name })
      map.set(itemId, list)
    }
    return map
  }, [links.data])

  return (itemId) => byItem.get(itemId) ?? NO_TAGS
}
