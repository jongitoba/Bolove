export type DwellingTypeCode = '00' | '01' | '02' | '03'
export interface DwellingTypeOption {
  code: DwellingTypeCode
  label: string
}

export interface QuarterOption {
  /** e.g. "2025K4" */
  code: string
  label: string
}

export type SsbContentCode = 'KvPris' | 'Omsetninger'

export type RegionGranularity = 'fylke' | 'kommune'

/** metric -> quarter code -> region code -> value (null = SSB reported no data for that cell) */
export type StatsTable = Record<SsbContentCode, Record<string, Record<string, number | null>>>

export interface HousingStatsQuery {
  granularity: RegionGranularity
  dwellingType: DwellingTypeCode
  /** Quarter codes to fetch, e.g. ["2025K4", "2026K1"]. */
  quarters: string[]
}

/**
 * Source-agnostic interface for municipality/county housing price statistics.
 * Keep all source-specific logic (endpoints, query formats, parsing) behind
 * an implementation of this interface — see `pxwebAdapter.ts` for the SSB
 * PxWebApi implementation and `index.ts` for the single swap point.
 */
export interface HousingDataAdapter {
  getDwellingTypes(): Promise<DwellingTypeOption[]>
  getQuarters(): Promise<QuarterOption[]>
  getStats(query: HousingStatsQuery): Promise<StatsTable>
}
