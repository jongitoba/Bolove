'use client'

import { useHousingStats } from '../state/HousingStatsProvider'
import styles from '../kart.module.css'

export default function Legend() {
  const { legend } = useHousingStats()
  if (!legend) return null

  return (
    <div className={styles.legend}>
      <h3 className={styles['legend__title']}>{legend.title}</h3>
      <ul className={styles['legend__list']}>
        {legend.classes.map((c, i) => (
          <li key={i} className={styles['legend__row']}>
            <span className={styles['legend__swatch']} style={{ backgroundColor: c.color }} />
            {c.label}
          </li>
        ))}
        <li className={styles['legend__row']}>
          <span
            className={`${styles['legend__swatch']} ${styles['legend__swatch--no-data']}`}
            style={{ backgroundColor: legend.noDataColor }}
          />
          {legend.noDataLabel}
        </li>
      </ul>
      <p className={styles['legend__coverage']}>
        {legend.coverage.withData} of {legend.coverage.total} regions have data
      </p>
    </div>
  )
}
