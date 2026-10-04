import { useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Runs an async function and tracks its result.
 *
 * Small on purpose — there is no query cache here. Every view calls into the
 * main process and re-runs when its dependencies change (usually including
 * `dataVersion` from the store, so any write refreshes the screen).
 *
 * The `cancelled` flag stops a slow response from overwriting a newer one,
 * which matters for search: results for "pos" must never land after "postgres".
 */
export function useAsync<T>(run: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    let cancelled = false
    setState((previous) => ({ ...previous, loading: true }))

    run()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setState({ data: null, error: cause instanceof Error ? cause.message : String(cause), loading: false })
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}

/** Debounces a value. Used so search does not query on every keystroke. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
