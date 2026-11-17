import { pxwebAdapter } from './pxwebAdapter'
import type { HousingDataAdapter } from './types'

// Single swap point: point this at a different HousingDataAdapter
// implementation to change the housing-stats source without touching any
// consumer (HousingStatsProvider, components, etc).
export const housingDataAdapter: HousingDataAdapter = pxwebAdapter

export * from './types'
