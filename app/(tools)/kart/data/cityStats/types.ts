// Shared interface every per-city fine-granularity adapter conforms to.
// Unlike the SSB adapter (data/ssb), which is the single national source for
// fylke/kommune, fine granularities (bydel/grunnkrets) are inherently
// city-specific — SSB's table 14310 doesn't go finer than kommune. Each city
// that publishes comparable open statistics gets its own adapter module; the
// registry (registry.ts) is the only place that lists which cities exist.

export type RegionGranularity = 'bydel' | 'grunnkrets'

export interface DwellingTypeOption {
  code: string
  label: string
}

export interface PeriodOption {
  /** A city's native period code — a year ("2025") for an annual table, a quarter ("2025K4") for a quarterly one, etc. */
  code: string
  label: string
}

/** Metrics are normalized to these two canonical names so the UI/provider never needs per-city cases. */
export type CanonicalMetric = 'price' | 'transactions'

/** metric -> period code -> region code -> value (null = no data reported for that cell) */
export type CityStatsTable = Record<CanonicalMetric, Record<string, Record<string, number | null>>>

export interface CityStatsQuery {
  granularity: RegionGranularity
  dwellingType: string
  periods: string[]
}

export interface CityAdapter {
  /** Stable id, e.g. "oslo" — used as the registry key and in coverage notes. */
  cityId: string
  /** Display name, e.g. "Oslo". */
  cityLabel: string
  /** Which of the two fine granularities this city currently has BOTH data and boundary geometry for. Empty for a not-yet-implemented stub. */
  supportedGranularities: RegionGranularity[]
  getDwellingTypes(): Promise<DwellingTypeOption[]>
  getPeriods(): Promise<PeriodOption[]>
  getStats(query: CityStatsQuery): Promise<CityStatsTable>
}
