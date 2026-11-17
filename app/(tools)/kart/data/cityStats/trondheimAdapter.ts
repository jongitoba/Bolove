import type { CityAdapter } from './types'

// STUB — not yet implemented. Trondheim kommune's open-data channels were
// not checked against a comparable PxWeb-style price table in this session.
// See bergenAdapter.ts for the exact steps to wire a real city in — same
// process applies here: find/verify an endpoint, implement this adapter to
// the CityAdapter shape (osloAdapter.ts is the reference implementation),
// source boundary GeoJSON for Trondheim's bydeler/grunnkretser, and register
// it in registry.ts.
export const trondheimAdapter: CityAdapter = {
  cityId: 'trondheim',
  cityLabel: 'Trondheim',
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
