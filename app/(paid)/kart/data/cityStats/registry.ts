import { osloAdapter } from './osloAdapter'
import { bergenAdapter } from './bergenAdapter'
import { trondheimAdapter } from './trondheimAdapter'
import { stavangerAdapter } from './stavangerAdapter'
import type { CityAdapter, RegionGranularity } from './types'

// Every registered city adapter. Add a new city by writing one adapter
// module conforming to CityAdapter (osloAdapter.ts is the reference
// implementation; bergenAdapter.ts documents the steps for a not-yet-wired
// city) and appending it here — nothing else in the app needs to change.
export const CITY_REGISTRY: CityAdapter[] = [osloAdapter, bergenAdapter, trondheimAdapter, stavangerAdapter]

/** Cities that currently have both data and boundary geometry for a given fine granularity. */
export function citiesSupporting(granularity: RegionGranularity): CityAdapter[] {
  return CITY_REGISTRY.filter((c) => c.supportedGranularities.includes(granularity))
}

export * from './types'
