import type { CityAdapter } from './types'

// STUB — not yet implemented. Stavanger kommune's open-data channels were
// not checked against a comparable PxWeb-style price table in this session.
// See bergenAdapter.ts for the exact steps to wire a real city in — same
// process applies here: find/verify an endpoint, implement this adapter to
// the CityAdapter shape (osloAdapter.ts is the reference implementation),
// source boundary GeoJSON for Stavanger's bydeler/grunnkretser, and register
// it in registry.ts.
export const stavangerAdapter: CityAdapter = {
  cityId: 'stavanger',
  cityLabel: 'Stavanger',
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
