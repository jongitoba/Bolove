import { createJsonStatIndexer, type JsonStat2Dataset } from '../jsonStat'
import { withCache } from '../cache'
import type {
  DwellingTypeOption,
  HousingDataAdapter,
  HousingStatsQuery,
  QuarterOption,
  RegionGranularity,
  StatsTable,
} from './types'

// Verified live on 2026-07-27 with direct curl requests against data.ssb.no
// (both the metadata GET and a POST query round-tripped exactly the shapes
// this file expects). This is SSB's PxWebApi v0/v1 — POST-only, json-stat2
// response — documented at https://www.ssb.no/en/api/pxwebapi. SSB has
// announced PxWebApi 2.0 (GET-based, all-tables) as the eventual primary
// API — https://www.ssb.no/en/api/pxwebapiv1/pxwebapi-2.0-beta — but v1
// continues to run in parallel "for a period of time". If v0 is retired,
// only this file needs to change (see HousingDataAdapter in ./types).
// Table 14310 itself: https://www.ssb.no/statbank/table/14310
// ("Gjennomsnittlig kvadratmeterpris og antall omsetninger, etter region,
// boligtype, statistikkvariabel og kvartal").
//
// Confirmed via GetCapabilities-equivalent (a GET on the table URL returns
// its variables): Region mixes 2-digit fylke codes and 4-digit kommune
// codes in one flat list (plus "0" for the whole country) — so the same
// table serves both granularities; we just filter the code list by length.
// Docs on API limits: 800,000 cells/query, 30 queries/min per IP — our
// queries (a few hundred regions × 2 metrics × 1-3 quarters) are several
// orders of magnitude under both.
const TABLE_URL = 'https://data.ssb.no/api/v0/no/table/14310'

interface SsbMetadataVariable {
  code: string
  values: string[]
  valueTexts: string[]
}

interface SsbMetadata {
  variables: SsbMetadataVariable[]
}

let metadataPromise: Promise<SsbMetadata> | null = null

function fetchMetadata(): Promise<SsbMetadata> {
  if (!metadataPromise) {
    metadataPromise = withCache('metadata', async () => {
      const res = await fetch(TABLE_URL)
      if (!res.ok) throw new Error(`SSB metadata request failed: ${res.status}`)
      return (await res.json()) as SsbMetadata
    })
  }
  return metadataPromise
}

function findVariable(meta: SsbMetadata, code: string): SsbMetadataVariable {
  const v = meta.variables.find((x) => x.code === code)
  if (!v) throw new Error(`SSB table 14310: expected variable "${code}" not found in metadata`)
  return v
}

async function fetchRegionCodes(granularity: RegionGranularity): Promise<string[]> {
  const meta = await fetchMetadata()
  const region = findVariable(meta, 'Region')
  const pattern = granularity === 'kommune' ? /^\d{4}$/ : /^\d{2}$/
  return region.values.filter((v) => pattern.test(v))
}

async function postQuery(query: unknown): Promise<JsonStat2Dataset> {
  const res = await fetch(TABLE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!res.ok) throw new Error(`SSB query failed: ${res.status}`)
  return (await res.json()) as JsonStat2Dataset
}

const METRICS = ['KvPris', 'Omsetninger'] as const

export const pxwebAdapter: HousingDataAdapter = {
  async getDwellingTypes(): Promise<DwellingTypeOption[]> {
    const meta = await fetchMetadata()
    const v = findVariable(meta, 'Boligtype')
    return v.values.map((code, i) => ({ code: code as DwellingTypeOption['code'], label: v.valueTexts[i] }))
  },

  async getQuarters(): Promise<QuarterOption[]> {
    const meta = await fetchMetadata()
    const v = findVariable(meta, 'Tid')
    return v.values.map((code, i) => ({ code, label: v.valueTexts[i] }))
  },

  async getStats({ granularity, dwellingType, quarters }: HousingStatsQuery): Promise<StatsTable> {
    const cacheKey = `stats:${granularity}:${dwellingType}:${[...quarters].sort().join(',')}`
    return withCache(cacheKey, async () => {
      const regionCodes = await fetchRegionCodes(granularity)

      const dataset = await postQuery({
        query: [
          { code: 'Region', selection: { filter: 'item', values: regionCodes } },
          { code: 'Boligtype', selection: { filter: 'item', values: [dwellingType] } },
          { code: 'ContentsCode', selection: { filter: 'item', values: [...METRICS] } },
          { code: 'Tid', selection: { filter: 'item', values: quarters } },
        ],
        response: { format: 'json-stat2' },
      })

      const indexer = createJsonStatIndexer(dataset)
      const table: StatsTable = { KvPris: {}, Omsetninger: {} }
      for (const metric of METRICS) {
        for (const quarter of quarters) {
          const perRegion: Record<string, number | null> = {}
          for (const region of regionCodes) {
            perRegion[region] = indexer.get({
              Region: region,
              Boligtype: dwellingType,
              ContentsCode: metric,
              Tid: quarter,
            })
          }
          table[metric][quarter] = perRegion
        }
      }
      return table
    })
  },
}
