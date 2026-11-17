// Small localStorage-backed cache so repeat interactions (switching metric,
// dwelling type, quarter/period, granularity) don't refetch from a stats
// source. Best-effort: if localStorage is unavailable or full, we just fall
// through to a live fetch. Shared by every adapter under data/ssb and
// data/cityStats — not specific to any one source.

const PREFIX = 'eiendom-gis:stats-cache:'
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // these tables update at most quarterly/annually; a day is plenty

interface CacheEnvelope<T> {
  cachedAt: number
  data: T
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // quota exceeded or storage disabled — cache is a nice-to-have, not required
  }
}

export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const raw = readRaw(key)
  if (raw) {
    try {
      const envelope: CacheEnvelope<T> = JSON.parse(raw)
      if (Date.now() - envelope.cachedAt < ttlMs) return envelope.data
    } catch {
      // corrupt entry — ignore and refetch
    }
  }

  const data = await fetcher()
  writeRaw(key, JSON.stringify({ cachedAt: Date.now(), data }))
  return data
}
