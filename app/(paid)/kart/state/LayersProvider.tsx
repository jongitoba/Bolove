'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LAYER_REGISTRY, type LayerConfig } from '../config/layers'

export interface LayerState {
  config: LayerConfig
  visible: boolean
  opacity: number
  /** Selected granularity id, only meaningful for sourceType 'geojson-choropleth'. */
  granularityId?: string
}

interface LayersContextValue {
  /** Ordered top (index 0) to bottom, matching both sidebar order and map stacking order. */
  layers: LayerState[]
  toggleVisibility: (id: string) => void
  setOpacity: (id: string, opacity: number) => void
  moveLayer: (id: string, direction: 'up' | 'down') => void
  setGranularity: (id: string, granularityId: string) => void
}

const LayersContext = createContext<LayersContextValue | null>(null)

export function LayersProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<string[]>(() => LAYER_REGISTRY.map((l) => l.id))
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYER_REGISTRY.map((l) => [l.id, l.defaultVisible])),
  )
  const [opacity, setOpacityState] = useState<Record<string, number>>(() =>
    Object.fromEntries(LAYER_REGISTRY.map((l) => [l.id, l.defaultOpacity])),
  )
  const [granularity, setGranularityState] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      LAYER_REGISTRY.filter(
        (l): l is Extract<LayerConfig, { sourceType: 'geojson-choropleth' }> =>
          l.sourceType === 'geojson-choropleth',
      ).map((l) => [l.id, l.defaultGranularityId]),
    ),
  )

  const configById = useMemo(
    () => Object.fromEntries(LAYER_REGISTRY.map((l) => [l.id, l])),
    [],
  )

  const layers = useMemo<LayerState[]>(
    () =>
      order.map((id) => ({
        config: configById[id],
        visible: visibility[id],
        opacity: opacity[id],
        granularityId: granularity[id],
      })),
    [order, visibility, opacity, granularity, configById],
  )

  function toggleVisibility(id: string) {
    setVisibility((v) => ({ ...v, [id]: !v[id] }))
  }

  function setOpacity(id: string, value: number) {
    setOpacityState((o) => ({ ...o, [id]: value }))
  }

  function moveLayer(id: string, direction: 'up' | 'down') {
    setOrder((current) => {
      const index = current.indexOf(id)
      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= current.length) return current
      const next = [...current]
      ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
      return next
    })
  }

  function setGranularity(id: string, granularityId: string) {
    setGranularityState((g) => ({ ...g, [id]: granularityId }))
  }

  return (
    <LayersContext.Provider
      value={{ layers, toggleVisibility, setOpacity, moveLayer, setGranularity }}
    >
      {children}
    </LayersContext.Provider>
  )
}

export function useLayers() {
  const ctx = useContext(LayersContext)
  if (!ctx) throw new Error('useLayers must be used within a LayersProvider')
  return ctx
}
