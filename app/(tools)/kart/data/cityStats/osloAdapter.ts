import { createJsonStatIndexer, type JsonStat2Dataset } from '../jsonStat'
import { withCache } from '../cache'
import type { CanonicalMetric, CityAdapter, CityStatsQuery, CityStatsTable, DwellingTypeOption, PeriodOption, RegionGranularity } from './types'

// Verified live on 2026-07-27 via curl (metadata GET + a POST query
// round-tripped exactly the shapes this file expects). Oslo kommune runs its
// own PxWeb instance — the same API family SSB uses (POST + json-stat2) —
// at statistikkbanken.oslo.kommune.no. Table page (for humans):
// https://statistikkbanken.oslo.kommune.no/statbank/pxweb/no/db1/db1__Boliger%20og%20byggevirksomhet__Boligpriser/ok-bol018.px/
// Docs/background: https://www.oslo.kommune.no/statistikk/boligpriser-boforhold-og-byggevirksomhet/boligpriser/
// BOL018 replaced BOL012 in April 2026 per the table's own metadata "note"
// field (a BRA/BRA-i vs. p-rom area-measurement standard change) — if BOL018
// is retired the same way, only this file needs to change.
const TABLE_URL =
  'https://statistikkbanken.oslo.kommune.no/statbank/api/v1/no/db1/Boliger%20og%20byggevirksomhet/Boligpriser/ok-bol018.px'

// This table reports at annual granularity (variable "år", not quarters) and
// bundles TWO geography levels into one flat "geografi" code list:
//   - bydel-level codes "1".."17" (no zero-padding) — verified to match,
//     after Number()-normalizing, the BYDELNR field ("01".."17") in Oslo
//     kommune's own "Oslo_bydeler" ArcGIS boundary service (see
//     public/data/oslo-bydeler.geojson, property `bydelnummer`).
//   - grunnkretsområde-level codes "10201".."170101" (5-6 digits) — verified
//     to match EXACTLY (336/336) the `GrnkrtsOm` field in Oslo kommune's
//     "Boliger_pr_grunnkrets" ArcGIS boundary service, dissolved to that
//     level (see public/data/oslo-grunnkretsomrade.geojson, property
//     `grunnkretsomradeid`).
// Both boundary services are public Esri Feature Services owned by Oslo
// kommune's Plan- og bygningsetaten (services-eu1.arcgis.com/Hky23fkHucfDZYMu/...).
//
// Quirk (verified live): unlike SSB's table 14310, where a variable's
// `values` array already holds the real-world codes, BOL018's "geografi"
// (and "år" and "boligtype") variables were authored with `values` as
// meaningless sequential position strings ("0".."451") and the REAL
// geografi/year/dwelling-type codes living in `valueTexts` instead. Query
// selections must use `values` (what PxWeb expects), but our OUTPUT keys —
// the ones that must match the boundary GeoJSON's region-key property —
// need `valueTexts`. `regionMappingsFor` below is the only place this
// matters: `getPeriods`/`getDwellingTypes` don't need their real-world label
// as a lookup key, only as display text, so `values` alone is fine there.
function regionCodePattern(granularity: RegionGranularity): RegExp {
  return granularity === 'bydel' ? /^\d{1,2}$/ : /^\d{5,6}$/
}

interface RegionMapping {
  /** What PxWeb expects in the query's `selection.values`. */
  queryValue: string
  /** The real geografi code — matches the boundary GeoJSON's region-key property. */
  regionCode: string
}

const DWELLING_TYPE_VAR = 'boligtype'
const METRIC_VAR = 'statistikkvariabel'
const PERIOD_VAR = 'år'
const REGION_VAR = 'geografi'

// statistikkvariabel codes, from the table's own metadata (verified live):
// "0" = Antall salg (transactions), "1" = avg. m² (unused here), "2" = avg. price/m².
const METRIC_CODE: Record<CanonicalMetric, string> = { transactions: '0', price: '2' }

interface OsloMetadataVariable {
  code: string
  values: string[]
  valueTexts: string[]
}

interface OsloMetadata {
  variables: OsloMetadataVariable[]
}

let metadataPromise: Promise<OsloMetadata> | null = null

function fetchMetadata(): Promise<OsloMetadata> {
  if (!metadataPromise) {
    metadataPromise = withCache('oslo-bol018-metadata', async () => {
      const res = await fetch(TABLE_URL)
      if (!res.ok) throw new Error(`Oslo statistikkbank metadata request failed: ${res.status}`)
      return (await res.json()) as OsloMetadata
    })
  }
  return metadataPromise
}

function findVariable(meta: OsloMetadata, code: string): OsloMetadataVariable {
  const v = meta.variables.find((x) => x.code === code)
  if (!v) throw new Error(`Oslo BOL018: expected variable "${code}" not found in metadata`)
  return v
}

async function regionMappingsFor(granularity: RegionGranularity): Promise<RegionMapping[]> {
  const meta = await fetchMetadata()
  const region = findVariable(meta, REGION_VAR)
  const pattern = regionCodePattern(granularity)
  const mappings: RegionMapping[] = []
  for (let i = 0; i < region.valueTexts.length; i++) {
    const regionCode = region.valueTexts[i]
    if (pattern.test(regionCode)) mappings.push({ queryValue: region.values[i], regionCode })
  }
  return mappings
}

async function postQuery(query: unknown): Promise<JsonStat2Dataset> {
  const res = await fetch(TABLE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!res.ok) throw new Error(`Oslo statistikkbank query failed: ${res.status}`)
  return (await res.json()) as JsonStat2Dataset
}

export const osloAdapter: CityAdapter = {
  cityId: 'oslo',
  cityLabel: 'Oslo',
  supportedGranularities: ['bydel', 'grunnkrets'],

  async getDwellingTypes(): Promise<DwellingTypeOption[]> {
    const meta = await fetchMetadata()
    const v = findVariable(meta, DWELLING_TYPE_VAR)
    return v.values.map((code, i) => ({ code, label: v.valueTexts[i] }))
  },

  async getPeriods(): Promise<PeriodOption[]> {
    const meta = await fetchMetadata()
    const v = findVariable(meta, PERIOD_VAR)
    return v.values.map((code, i) => ({ code, label: v.valueTexts[i] }))
  },

  async getStats({ granularity, dwellingType, periods }: CityStatsQuery): Promise<CityStatsTable> {
    const cacheKey = `oslo-bol018-stats:${granularity}:${dwellingType}:${[...periods].sort().join(',')}`
    return withCache(cacheKey, async () => {
      const mappings = await regionMappingsFor(granularity)

      const dataset = await postQuery({
        query: [
          { code: REGION_VAR, selection: { filter: 'item', values: mappings.map((m) => m.queryValue) } },
          { code: DWELLING_TYPE_VAR, selection: { filter: 'item', values: [dwellingType] } },
          { code: METRIC_VAR, selection: { filter: 'item', values: Object.values(METRIC_CODE) } },
          { code: PERIOD_VAR, selection: { filter: 'item', values: periods } },
        ],
        response: { format: 'json-stat2' },
      })

      const indexer = createJsonStatIndexer(dataset)
      // Oslo's PxWeb instance wraps this single-measure table in a synthetic
      // "ContentsCode" dimension with one fixed category. It's not something
      // we choose — every cell lookup just needs to name it.
      const contentsCodeValue = indexer.dimensionCodes('ContentsCode')[0]

      const table: CityStatsTable = { price: {}, transactions: {} }
      for (const canonical of Object.keys(METRIC_CODE) as CanonicalMetric[]) {
        const code = METRIC_CODE[canonical]
        for (const period of periods) {
          const perRegion: Record<string, number | null> = {}
          for (const { queryValue, regionCode } of mappings) {
            perRegion[regionCode] = indexer.get({
              ContentsCode: contentsCodeValue,
              [REGION_VAR]: queryValue,
              [DWELLING_TYPE_VAR]: dwellingType,
              [METRIC_VAR]: code,
              [PERIOD_VAR]: period,
            })
          }
          table[canonical][period] = perRegion
        }
      }
      return table
    })
  },
}
