'use client'

import { useHousingStats } from '../state/HousingStatsProvider'
import type { RegionPeriodValue } from '../state/HousingStatsProvider'
import styles from '../kart.module.css'

const nbNumber = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

function formatPrice(value: number | null): string {
  return value === null ? 'Ingen data' : `${nbNumber.format(Math.round(value))} kr`
}

function formatTransactions(value: number | null): string {
  return value === null ? 'Ingen data' : nbNumber.format(Math.round(value))
}

function formatPercent(value: number | null): string {
  return value === null ? 'Ingen data' : `${value > 0 ? '+' : ''}${value.toFixed(1)} %`
}

const SPARKLINE_WIDTH = 220
const SPARKLINE_HEIGHT = 48
const SPARKLINE_PAD = 6

function PriceSparkline({ series }: { series: RegionPeriodValue[] }) {
  const points = series.filter((p): p is { period: string; value: number } => p.value !== null)
  if (points.length < 2) {
    return <p className={styles['detail-panel__sparkline-empty']}>Not enough periods with data to plot a trend.</p>
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const innerW = SPARKLINE_WIDTH - SPARKLINE_PAD * 2
  const innerH = SPARKLINE_HEIGHT - SPARKLINE_PAD * 2

  // Plot every period on the x-axis (even ones with no data), so gaps in
  // the series show as gaps in the line rather than compressing the scale.
  const xFor = (i: number) => SPARKLINE_PAD + (i / (series.length - 1)) * innerW
  const yFor = (v: number) => SPARKLINE_PAD + innerH - ((v - min) / range) * innerH

  const segments: string[] = []
  let current: string[] = []
  series.forEach((p, i) => {
    if (p.value === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${xFor(i)},${yFor(p.value)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))

  return (
    <svg
      className={styles['detail-panel__sparkline']}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      role="img"
      aria-label={`Price per m² from ${points[0].period} to ${points[points.length - 1].period}`}
    >
      {segments.map((seg, i) => (
        <polyline key={i} points={seg} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinecap="round" />
      ))}
      {series.map((p, i) =>
        p.value === null ? null : (
          <circle key={p.period} cx={xFor(i)} cy={yFor(p.value)} r={3} fill="#2a78d6" />
        ),
      )}
    </svg>
  )
}

export default function DetailPanel() {
  const { pinned, setPinned, getRegionSnapshot, dwellingTypes, dwellingType } = useHousingStats()

  if (!pinned) {
    return (
      <aside className={`${styles['detail-panel']} ${styles['detail-panel--empty']}`}>
        <h2>Detaljer</h2>
        <p className={styles['detail-panel__placeholder']}>Click a region on the map to see its details here.</p>
      </aside>
    )
  }

  const snapshot = getRegionSnapshot(pinned.regionCode)
  const dwellingLabel = dwellingTypes.find((d) => d.code === dwellingType)?.label ?? dwellingType
  const first = snapshot.priceSeries[0]
  const last = snapshot.priceSeries[snapshot.priceSeries.length - 1]

  return (
    <aside className={styles['detail-panel']}>
      <div className={styles['detail-panel__header']}>
        <h2>Detaljer</h2>
        <button
          type="button"
          className={styles['detail-panel__clear']}
          onClick={() => setPinned(null)}
          aria-label="Clear selection"
        >
          ✕
        </button>
      </div>

      <h3 className={styles['detail-panel__region-name']}>{pinned.regionName}</h3>
      <p className={styles['detail-panel__region-meta']}>{dwellingLabel}</p>

      <dl className={styles['detail-panel__metrics']}>
        <div className={styles['detail-panel__metric']}>
          <dt>Average price per m²</dt>
          <dd>{formatPrice(snapshot.price)}</dd>
        </div>
        <div className={styles['detail-panel__metric']}>
          <dt>Number of transactions</dt>
          <dd>{formatTransactions(snapshot.transactions)}</dd>
        </div>
        <div className={styles['detail-panel__metric']}>
          <dt>Period-over-period % change</dt>
          <dd>{formatPercent(snapshot.change)}</dd>
        </div>
      </dl>

      <h4 className={styles['detail-panel__series-title']}>Price per m² over time</h4>
      <PriceSparkline series={snapshot.priceSeries} />
      {first && last && (
        <div className={styles['detail-panel__series-range']}>
          <span>
            {first.period}: {formatPrice(first.value)}
          </span>
          <span>
            {last.period}: {formatPrice(last.value)}
          </span>
        </div>
      )}
    </aside>
  )
}
