'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { housingDataAdapter } from '../data/ssb'
import type { DwellingTypeOption as SsbDwellingTypeOption, QuarterOption, StatsTable as SsbStatsTable } from '../data/ssb'
import { citiesSupporting } from '../data/cityStats/registry'
import type { CityStatsTable, DwellingTypeOption, RegionGranularity as CityGranularity } from '../data/cityStats/types'
import { LAYER_REGISTRY, type ChoroplethLayerConfig } from '../config/layers'
import { useLayers } from './LayersProvider'
import { usePrefersDark } from '../hooks/usePrefersDark'
import { colorForValue, computeColorScale, NO_DATA_COLOR, type ColorScale } from './colorScale'

export type HousingMetric = 'price' | 'transactions' | 'change'

const CHOROPLETH_LAYER_ID = 'admin-boundaries'
const CITY_GRANULARITY_IDS: readonly string[] = ['bydel', 'grunnkrets']

const found = LAYER_REGISTRY.find(
  (l): l is ChoroplethLayerConfig => l.id === CHOROPLETH_LAYER_ID && l.sourceType === 'geojson-choropleth',
)
if (!found) {
  throw new Error(`Layer registry is missing the "${CHOROPLETH_LAYER_ID}" choropleth layer`)
}
const choroplethConfig: ChoroplethLayerConfig = found

/** Unifies SSB's {KvPris, Omsetninger} shape and cityStats' {price, transactions} shape into one internal representation, so every downstream calculation (color scale, legend, snapshot) is written once. */
type NormalizedStatsTable = Record<'price' | 'transactions', Record<string, Record<string, number | null>>>

function normalizeSsbTable(t: SsbStatsTable): NormalizedStatsTable {
  return { price: t.KvPris, transactions: t.Omsetninger }
}

function normalizeCityTable(t: CityStatsTable): NormalizedStatsTable {
  return { price: t.price, transactions: t.transactions }
}

export interface LegendClass {
  color: string
  label: string
}

export interface Legend {
  title: string
  classes: LegendClass[]
  noDataColor: string
  noDataLabel: string
  /** How many regions had a value vs. the total region count, for the current metric/period selection. */
  coverage: { withData: number; total: number }
}

export interface PinnedRegion {
  regionCode: string
  regionName: string
}

export interface RegionPeriodValue {
  period: string
  value: number | null
}

export interface RegionSnapshot {
  price: number | null
  transactions: number | null
  change: number | null
  /** Average price/m², one point per period the active source returns, in order. */
  priceSeries: RegionPeriodValue[]
}

/** Shown when a fine (bydel/grunnkrets) granularity is selected, since coverage is city-specific rather than national. */
export interface CityCoverage {
  granularity: CityGranularity
  citiesWithData: string[]
}

interface HousingStatsContextValue {
  dwellingTypes: (DwellingTypeOption | SsbDwellingTypeOption)[]
  periods: QuarterOption[]
  dwellingType: string
  setDwellingType: (code: string) => void
  metric: HousingMetric
  setMetric: (metric: HousingMetric) => void
  period: string
  setPeriod: (code: string) => void
  periodFrom: string
  setPeriodFrom: (code: string) => void
  periodTo: string
  setPeriodTo: (code: string) => void
  loading: boolean
  error: string | null
  /** Region-key property (fylkesnummer/kommunenummer/bydelnummer/grunnkretsomradeid) for the currently active granularity. */
  regionKeyProperty: string
  /** GeoJSON feature property holding the region's display name for the active granularity. */
  nameProperty: string
  /** MapLibre "match" fill-color expression for the active granularity, or null while loading/empty. */
  fillColorExpression: unknown[] | null
  legend: Legend | null
  /** Set only for bydel/grunnkrets — which cities currently have data at that granularity. */
  cityCoverage: CityCoverage | null
  /** Value for the currently selected metric, for tooltip/hover use. */
  getRegionValue: (regionCode: string) => number | null
  /** Formats a raw metric value the same way the legend/tooltip do. */
  formatMetricValue: (value: number | null) => string
  /** All available metrics + a full price/m² time series for one region, for the pinned detail panel. */
  getRegionSnapshot: (regionCode: string) => RegionSnapshot
  pinned: PinnedRegion | null
  setPinned: (pinned: PinnedRegion | null) => void
}

const HousingStatsContext = createContext<HousingStatsContextValue | null>(null)

function formatNumber(n: number): string {
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function formatByMetric(value: number, metric: HousingMetric): string {
  if (metric === 'change') return `${value > 0 ? '+' : ''}${value.toFixed(1)} %`
  if (metric === 'price') return `${formatNumber(value)} kr`
  return formatNumber(value)
}

function priceAt(table: NormalizedStatsTable | null, period: string, regionCode: string): number | null {
  return table?.price[period]?.[regionCode] ?? null
}

function transactionsAt(table: NormalizedStatsTable | null, period: string, regionCode: string): number | null {
  return table?.transactions[period]?.[regionCode] ?? null
}

function pctChange(table: NormalizedStatsTable | null, from: string, to: string, regionCode: string): number | null {
  const a = priceAt(table, from, regionCode)
  const b = priceAt(table, to, regionCode)
  if (a == null || b == null || a === 0) return null
  return ((b - a) / a) * 100
}

function isCityGranularity(granularityId: string): granularityId is CityGranularity {
  return CITY_GRANULARITY_IDS.includes(granularityId)
}

export function HousingStatsProvider({ children }: { children: ReactNode }) {
  const { layers } = useLayers()
  const dark = usePrefersDark()

  const choroplethLayer = layers.find((l) => l.config.id === CHOROPLETH_LAYER_ID)
  const activeGranularityId = choroplethLayer?.granularityId ?? choroplethConfig.defaultGranularityId
  const activeGranularityConfig =
    choroplethConfig.granularities.find((g) => g.id === activeGranularityId) ?? choroplethConfig.granularities[0]
  const { regionKeyProperty, nameProperty } = activeGranularityConfig
  const isCity = isCityGranularity(activeGranularityId)
  // Keyed on national-vs-city (not the specific granularity), so switching
  // fylke<->kommune or bydel<->grunnkrets doesn't needlessly reload options
  // that come from the same source.
  const sourceKind = isCity ? 'city' : 'national'

  const [dwellingTypes, setDwellingTypes] = useState<(DwellingTypeOption | SsbDwellingTypeOption)[]>([])
  const [periods, setPeriods] = useState<QuarterOption[]>([])
  const [dwellingType, setDwellingType] = useState<string>('')
  const [metric, setMetric] = useState<HousingMetric>('price')
  const [period, setPeriod] = useState<string>('')
  const [periodFrom, setPeriodFrom] = useState<string>('')
  const [periodTo, setPeriodTo] = useState<string>('')
  const [pinned, setPinned] = useState<PinnedRegion | null>(null)

  const [statsTable, setStatsTable] = useState<NormalizedStatsTable | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the option lists (dwelling types, periods) whenever we cross the
  // national/city boundary, and pick sensible defaults (latest period;
  // latest two for the change comparison).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let types: (DwellingTypeOption | SsbDwellingTypeOption)[]
        let periodOptions: QuarterOption[]
        if (isCity) {
          const city = citiesSupporting(activeGranularityId as CityGranularity)[0]
          ;[types, periodOptions] = city
            ? await Promise.all([city.getDwellingTypes(), city.getPeriods()])
            : [[], []]
        } else {
          ;[types, periodOptions] = await Promise.all([
            housingDataAdapter.getDwellingTypes(),
            housingDataAdapter.getQuarters(),
          ])
        }
        if (cancelled) return
        setDwellingTypes(types)
        setPeriods(periodOptions)
        setDwellingType(types[0]?.code ?? '')
        if (periodOptions.length > 0) {
          setPeriod(periodOptions[periodOptions.length - 1].code)
          setPeriodTo(periodOptions[periodOptions.length - 1].code)
          setPeriodFrom(periodOptions[Math.max(0, periodOptions.length - 2)].code)
        } else {
          setPeriod('')
          setPeriodTo('')
          setPeriodFrom('')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKind])

  // Fetch every period the active source returns (not just the one(s)
  // currently selected in the UI) whenever the specific granularity or
  // dwelling type changes — cheap, and means the pinned region's price
  // time-series and any period/period-pair switch never needs a second
  // round trip.
  const allPeriodCodes = useMemo(() => periods.map((p) => p.code), [periods])

  useEffect(() => {
    if (allPeriodCodes.length === 0 || !dwellingType) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        let normalized: NormalizedStatsTable
        if (isCity) {
          const cities = citiesSupporting(activeGranularityId as CityGranularity)
          const tables = await Promise.all(
            cities.map((c) =>
              c.getStats({ granularity: activeGranularityId as CityGranularity, dwellingType, periods: allPeriodCodes }),
            ),
          )
          // Merge every city's table into one — currently just Oslo, but a
          // second registered city's regions simply appear alongside it.
          const merged: CityStatsTable = { price: {}, transactions: {} }
          for (const t of tables) {
            for (const metricKey of ['price', 'transactions'] as const) {
              for (const [p, regionMap] of Object.entries(t[metricKey])) {
                merged[metricKey][p] = { ...merged[metricKey][p], ...regionMap }
              }
            }
          }
          normalized = normalizeCityTable(merged)
        } else {
          const table = await housingDataAdapter.getStats({
            granularity: activeGranularityId as 'fylke' | 'kommune',
            dwellingType: dwellingType as SsbDwellingTypeOption['code'],
            quarters: allPeriodCodes,
          })
          normalized = normalizeSsbTable(table)
        }
        if (!cancelled) setStatsTable(normalized)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeGranularityId, isCity, dwellingType, allPeriodCodes])

  // A pinned region from one granularity is meaningless in another
  // (different code space) — drop it rather than show stale/wrong data.
  useEffect(() => {
    setPinned(null)
  }, [activeGranularityId])

  const cityCoverage: CityCoverage | null = isCity
    ? {
        granularity: activeGranularityId as CityGranularity,
        citiesWithData: citiesSupporting(activeGranularityId as CityGranularity).map((c) => c.cityLabel),
      }
    : null

  const getRegionValue = useMemo(() => {
    return (regionCode: string): number | null => {
      if (metric === 'price') return priceAt(statsTable, period, regionCode)
      if (metric === 'transactions') return transactionsAt(statsTable, period, regionCode)
      return pctChange(statsTable, periodFrom, periodTo, regionCode)
    }
  }, [statsTable, metric, period, periodFrom, periodTo])

  const formatMetricValue = useMemo(() => {
    return (value: number | null): string => (value === null ? 'Ingen data' : formatByMetric(value, metric))
  }, [metric])

  const getRegionSnapshot = useMemo(() => {
    return (regionCode: string): RegionSnapshot => ({
      price: priceAt(statsTable, period, regionCode),
      transactions: transactionsAt(statsTable, period, regionCode),
      change: pctChange(statsTable, periodFrom, periodTo, regionCode),
      // Display label (e.g. "2025K1" or, for an annual city source, "2025"),
      // not the raw code — SSB's codes happen to already be human-readable,
      // but a city source's period codes can be opaque (see osloAdapter.ts).
      priceSeries: periods.map((p) => ({ period: p.label, value: priceAt(statsTable, p.code, regionCode) })),
    })
  }, [statsTable, period, periodFrom, periodTo, periods])

  const { fillColorExpression, legend } = useMemo(() => {
    if (!statsTable) return { fillColorExpression: null, legend: null }

    const referencePeriod = metric === 'change' ? periodTo : period
    const regionCodes = Object.keys(statsTable.price[referencePeriod] ?? statsTable.transactions[referencePeriod] ?? {})
    if (regionCodes.length === 0) return { fillColorExpression: null, legend: null }

    const kind = metric === 'change' ? 'diverging' : 'sequential'
    const values = regionCodes.map(getRegionValue).filter((v): v is number => v !== null)
    const scale: ColorScale = computeColorScale(values, kind, dark)

    const expression: unknown[] = ['match', ['get', regionKeyProperty]]
    for (const code of regionCodes) {
      const value = getRegionValue(code)
      if (value === null) continue // fall through to the default (no-data) color
      expression.push(code, colorForValue(scale, value))
    }
    expression.push(NO_DATA_COLOR)

    const periodFromLabel = periods.find((p) => p.code === periodFrom)?.label ?? periodFrom
    const periodToLabel = periods.find((p) => p.code === periodTo)?.label ?? periodTo
    const title =
      metric === 'price'
        ? 'Gj.snitt kvadratmeterpris'
        : metric === 'transactions'
          ? 'Antall omsetninger'
          : `Prisendring ${periodFromLabel} → ${periodToLabel}`

    const classes: LegendClass[] = scale.colors.map((color, i) => ({
      color,
      label: `${formatByMetric(scale.breaks[i], metric)} – ${formatByMetric(scale.breaks[i + 1], metric)}`,
    }))

    return {
      fillColorExpression: expression,
      legend: {
        title,
        classes,
        noDataColor: NO_DATA_COLOR,
        noDataLabel: 'Ingen data',
        coverage: { withData: values.length, total: regionCodes.length },
      },
    }
  }, [statsTable, metric, period, periodFrom, periodTo, periods, getRegionValue, regionKeyProperty, dark])

  const value: HousingStatsContextValue = {
    dwellingTypes,
    periods,
    dwellingType,
    setDwellingType,
    metric,
    setMetric,
    period,
    setPeriod,
    periodFrom,
    setPeriodFrom,
    periodTo,
    setPeriodTo,
    loading,
    error,
    regionKeyProperty,
    nameProperty,
    fillColorExpression,
    legend,
    cityCoverage,
    getRegionValue,
    formatMetricValue,
    getRegionSnapshot,
    pinned,
    setPinned,
  }

  return <HousingStatsContext.Provider value={value}>{children}</HousingStatsContext.Provider>
}

export function useHousingStats() {
  const ctx = useContext(HousingStatsContext)
  if (!ctx) throw new Error('useHousingStats must be used within a HousingStatsProvider')
  return ctx
}
