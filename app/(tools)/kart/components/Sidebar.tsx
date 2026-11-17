'use client'

import { useState } from 'react'
import { useLayers } from '../state/LayersProvider'
import HousingStatsControls from './HousingStatsControls'
import styles from '../kart.module.css'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { layers, toggleVisibility, setOpacity, moveLayer, setGranularity } = useLayers()

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles['sidebar--collapsed'] : ''}`}>
      <button
        className={styles['sidebar__toggle']}
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && (
        <div className={styles['sidebar__content']}>
          <h2>Lag</h2>
          <ul className={styles['layer-list']}>
            {layers.map((layer, index) => (
              <li key={layer.config.id} className={styles['layer-item']}>
                <div className={styles['layer-item__header']}>
                  <label className={styles['layer-item__label']}>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => toggleVisibility(layer.config.id)}
                    />
                    {layer.config.label}
                  </label>
                  <div className={styles['layer-item__order']}>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveLayer(layer.config.id, 'up')}
                      aria-label={`Move ${layer.config.label} up`}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === layers.length - 1}
                      onClick={() => moveLayer(layer.config.id, 'down')}
                      aria-label={`Move ${layer.config.label} down`}
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </div>

                {layer.config.description && (
                  <p className={styles['layer-item__description']}>{layer.config.description}</p>
                )}

                {layer.config.sourceType === 'geojson-choropleth' && (
                  <div className={styles['layer-item__granularity']} role="radiogroup" aria-label="Granularity">
                    {layer.config.granularities.map((granularity) => (
                      <label key={granularity.id} className={styles['layer-item__granularity-option']}>
                        <input
                          type="radio"
                          name={`granularity-${layer.config.id}`}
                          checked={layer.granularityId === granularity.id}
                          onChange={() => setGranularity(layer.config.id, granularity.id)}
                        />
                        {granularity.label}
                      </label>
                    ))}
                  </div>
                )}

                {layer.config.sourceType === 'geojson-choropleth' && <HousingStatsControls />}

                <label className={styles['layer-item__opacity']}>
                  Opasitet
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={layer.opacity}
                    disabled={!layer.visible}
                    onChange={(e) => setOpacity(layer.config.id, Number(e.target.value))}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
