'use client'

import { useEffect, useRef, useState } from 'react'
import type { MapMouseEvent } from 'maplibre-gl'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapStyle, OSLO_CENTER, OSLO_ZOOM } from '../config/mapProvider'
import { buildWmsTileUrl } from '../config/layers'
import { useLayers, type LayerState } from '../state/LayersProvider'
import { useHousingStats } from '../state/HousingStatsProvider'
import Legend from './Legend'
import styles from '../kart.module.css'

interface Tooltip {
  x: number
  y: number
  name: string
  text: string
}

function wmsSourceId(layerId: string) {
  return `layer-src-${layerId}`
}

function wmsMapLayerId(layerId: string) {
  return `layer-lyr-${layerId}`
}

function choroplethSourceId(layerId: string, granularityId: string) {
  return `layer-src-${layerId}-${granularityId}`
}

function choroplethMapLayerId(layerId: string, granularityId: string) {
  return `layer-lyr-${layerId}-${granularityId}`
}

/** All MapLibre layer ids a given LayerState maps to, regardless of source type. */
function mapLayerIdsFor(layer: LayerState): string[] {
  if (layer.config.sourceType === 'wms') return [wmsMapLayerId(layer.config.id)]
  return layer.config.granularities.map((g) => choroplethMapLayerId(layer.config.id, g.id))
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const { layers } = useLayers()
  const {
    fillColorExpression,
    regionKeyProperty,
    nameProperty,
    legend,
    getRegionValue,
    formatMetricValue,
    setPinned,
  } = useHousingStats()

  const choroplethLayer = layers.find((l) => l.config.sourceType === 'geojson-choropleth')
  const activeMapLayerId =
    choroplethLayer && choroplethLayer.visible && choroplethLayer.granularityId
      ? choroplethMapLayerId(choroplethLayer.config.id, choroplethLayer.granularityId)
      : null

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: OSLO_CENTER,
      zoom: OSLO_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => setMapReady(true))
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // Sync the registry-driven layer state (visibility, opacity, order,
  // granularity) onto the live MapLibre instance whenever it changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    for (const layer of layers) {
      if (layer.config.sourceType === 'wms') {
        const sourceId = wmsSourceId(layer.config.id)
        const mapLayerId = wmsMapLayerId(layer.config.id)

        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'raster',
            tiles: [buildWmsTileUrl(layer.config)],
            tileSize: layer.config.tileSize ?? 256,
            attribution: layer.config.attribution,
          })
        }

        if (!map.getLayer(mapLayerId)) {
          map.addLayer({
            id: mapLayerId,
            type: 'raster',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: { 'raster-opacity': layer.opacity },
          })
        } else {
          map.setLayoutProperty(mapLayerId, 'visibility', layer.visible ? 'visible' : 'none')
          map.setPaintProperty(mapLayerId, 'raster-opacity', layer.opacity)
        }
      } else {
        // geojson-choropleth: one source+layer per granularity variant;
        // only the selected granularity is shown, and only if the overall
        // layer is toggled visible.
        for (const granularity of layer.config.granularities) {
          const sourceId = choroplethSourceId(layer.config.id, granularity.id)
          const mapLayerId = choroplethMapLayerId(layer.config.id, granularity.id)
          const isActive = layer.visible && layer.granularityId === granularity.id
          // Only the active granularity gets the SSB-driven color scale;
          // the hidden one keeps the neutral fallback so it's ready to show
          // immediately if the user switches granularity before stats load.
          const fillColor = isActive && fillColorExpression ? fillColorExpression : layer.config.fillColor

          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: 'geojson',
              data: granularity.dataUrl,
              attribution: layer.config.attribution,
            })
          }

          if (!map.getLayer(mapLayerId)) {
            map.addLayer({
              id: mapLayerId,
              type: 'fill',
              source: sourceId,
              layout: { visibility: isActive ? 'visible' : 'none' },
              paint: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'fill-color': fillColor as any,
                'fill-opacity': layer.opacity,
                'fill-outline-color': '#555',
              },
            })
          } else {
            map.setLayoutProperty(mapLayerId, 'visibility', isActive ? 'visible' : 'none')
            map.setPaintProperty(mapLayerId, 'fill-opacity', layer.opacity)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.setPaintProperty(mapLayerId, 'fill-color', fillColor as any)
          }
        }
      }
    }

    // `layers` is ordered top-to-bottom (index 0 = topmost). Walk it
    // bottom-to-top, moving each layer's MapLibre layer(s) to the top of
    // the stack in turn, so the final stacking order matches the sidebar.
    for (const layer of [...layers].reverse()) {
      for (const mapLayerId of mapLayerIdsFor(layer)) {
        if (map.getLayer(mapLayerId)) map.moveLayer(mapLayerId)
      }
    }
  }, [layers, mapReady, fillColorExpression])

  // Hover tooltip (region name + current metric value) and click-to-pin,
  // bound to whichever granularity's MapLibre layer is currently active.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !activeMapLayerId) return

    const handleMove = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0]
      if (!feature) return
      const code = String(feature.properties?.[regionKeyProperty] ?? '')
      const name = String(feature.properties?.[nameProperty] ?? code)
      const value = getRegionValue(code)
      const label = legend?.title ?? 'Laster …'
      setTooltip({ x: e.point.x, y: e.point.y, name, text: `${label}: ${formatMetricValue(value)}` })
      map.getCanvas().style.cursor = 'pointer'
    }
    const handleLeave = () => {
      setTooltip(null)
      map.getCanvas().style.cursor = ''
    }
    const handleClick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0]
      if (!feature) return
      const code = String(feature.properties?.[regionKeyProperty] ?? '')
      const name = String(feature.properties?.[nameProperty] ?? code)
      if (code) setPinned({ regionCode: code, regionName: name })
    }

    map.on('mousemove', activeMapLayerId, handleMove)
    map.on('mouseleave', activeMapLayerId, handleLeave)
    map.on('click', activeMapLayerId, handleClick)

    return () => {
      map.off('mousemove', activeMapLayerId, handleMove)
      map.off('mouseleave', activeMapLayerId, handleLeave)
      map.off('click', activeMapLayerId, handleClick)
      map.getCanvas().style.cursor = ''
      setTooltip(null)
    }
  }, [mapReady, activeMapLayerId, regionKeyProperty, nameProperty, legend, getRegionValue, formatMetricValue, setPinned])

  return (
    <div className={styles['map-view-container']}>
      <div ref={containerRef} className={styles['map-view']} />
      {tooltip && (
        <div className={styles['map-tooltip']} style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <strong>{tooltip.name}</strong>
          <span>{tooltip.text}</span>
        </div>
      )}
      <Legend />
    </div>
  )
}
