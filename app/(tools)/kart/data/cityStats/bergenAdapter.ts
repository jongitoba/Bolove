import type { CityAdapter } from './types'

// STUB — not yet implemented. Bergen kommune's public statistics pages
// (bergen.kommune.no) were checked in the same session that built
// osloAdapter.ts, but no PxWeb (or comparable tabular API) instance exposing
// bydel/grunnkrets-level housing price data was found or confirmed live.
//
// To wire Bergen in for real:
//   1. Find Bergen's open statistics bank / API (if it runs PxWeb like
//      Oslo's does, the endpoint shape in osloAdapter.ts is a direct
//      template — same POST + json-stat2 query format).
//   2. Confirm it has a table comparable to Oslo's BOL018: price per m²
//      and/or transaction count, broken down by region + dwelling type +
//      period, verified live (GET metadata, POST a real query) before
//      writing any code against it.
//   3. Implement getDwellingTypes/getPeriods/getStats the same shape as
//      osloAdapter.ts, and set supportedGranularities to whichever of
//      'bydel'/'grunnkrets' it actually reports at.
//   4. Source and add boundary GeoJSON for Bergen's bydeler/grunnkretser
//      under public/data/, verifying the join key against the table's own
//      region codes the way oslo-bydeler.geojson/oslo-grunnkretsomrade.geojson
//      were (see the comment block in osloAdapter.ts for that process).
//   5. Register the adapter in registry.ts — nothing else in the app needs
//      to change.
//
// Until then, supportedGranularities is empty, so the registry never calls
// this adapter's methods and it never contributes to the map or coverage note.
export const bergenAdapter: CityAdapter = {
  cityId: 'bergen',
  cityLabel: 'Bergen',
  supportedGranularities: [],
  async getDwellingTypes() {
    return []
  },
  async getPeriods() {
    return []
  },
  async getStats() {
    return { price: {}, transactions: {} }
  },
}
