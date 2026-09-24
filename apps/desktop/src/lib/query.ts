import { useCallback, useEffect, useSyncExternalStore } from "react"

// A tiny stale-while-revalidate cache: views render cached data instantly and
// refresh in the background. Mutations call `invalidate()` with a key prefix.

interface Entry<T = unknown> { data?: T; error?: unknown; loading: boolean; at: number; promise?: Promise<void> }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => { version++; for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }

function load<T>(key: string, fetcher: () => Promise<T>) {
  const entry = (cache.get(key) ?? { loading: false, at: 0 }) as Entry<T>
  if (entry.promise) return entry.promise
  entry.loading = true
  entry.promise = fetcher().then(
    (data) => { entry.data = data; entry.error = undefined },
    (error) => { entry.error = error },
  ).finally(() => { entry.loading = false; entry.at = Date.now(); entry.promise = undefined; emit() })
  cache.set(key, entry)
  emit()
  return entry.promise
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, staleMs = 2_000) {
  useSyncExternalStore(subscribe, () => version)
  const entry = key ? cache.get(key) as Entry<T> | undefined : undefined
  useEffect(() => {
    if (!key) return
    const current = cache.get(key)
    if (!current || (!current.loading && Date.now() - current.at > staleMs)) void load(key, fetcher)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, entry?.at])
  const refetch = useCallback(() => key ? load(key, fetcher) : Promise.resolve(), [key, fetcher])
  return { data: entry?.data, error: entry?.error, loading: !entry || entry.loading, refreshing: !!entry?.loading && entry.data !== undefined, refetch }
}

export function invalidate(prefix = "") {
  for (const [key, entry] of cache) if (key.startsWith(prefix)) entry.at = 0
  emit()
}

export function clearCache() { cache.clear(); emit() }
