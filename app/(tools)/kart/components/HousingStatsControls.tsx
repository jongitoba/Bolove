'use client'

import { useHousingStats, type HousingMetric } from '../state/HousingStatsProvider'
import styles from '../kart.module.css'

const METRIC_OPTIONS: { value: HousingMetric; label: string }[] = [
  { value: 'price', label: 'Average price per m²' },
  { value: 'transactions', label: 'Number of transactions' },
  { value: 'change', label: 'Period-over-period % change' },
]

export default function HousingStatsControls() {
  const {
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
    cityCoverage,
  } = useHousingStats()

  return (
    <div className={styles['housing-stats']}>
      {cityCoverage && (
        <p className={styles['housing-stats__coverage-note']}>
          {cityCoverage.citiesWithData.length > 0
            ? `Fine-grained data available for: ${cityCoverage.citiesWithData.join(', ')}`
            : 'No cities currently have data at this granularity.'}
        </p>
      )}

      <label className={styles['housing-stats__field']}>
        Metric
        <select value={metric} onChange={(e) => setMetric(e.target.value as HousingMetric)}>
          {METRIC_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles['housing-stats__field']}>
        Dwelling type
        <select value={dwellingType} onChange={(e) => setDwellingType(e.target.value)}>
          {dwellingTypes.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {metric === 'change' ? (
        <div className={styles['housing-stats__period-pair']}>
          <label className={styles['housing-stats__field']}>
            From
            <select value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)}>
              {periods.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles['housing-stats__field']}>
            To
            <select value={periodTo} onChange={(e) => setPeriodTo(e.target.value)}>
              {periods.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <label className={styles['housing-stats__field']}>
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading && <p className={styles['housing-stats__status']}>Laster data …</p>}
      {error && (
        <p className={`${styles['housing-stats__status']} ${styles['housing-stats__status--error']}`}>
          Feil: {error}
        </p>
      )}
    </div>
  )
}
