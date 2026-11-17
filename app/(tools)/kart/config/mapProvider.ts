import type { StyleSpecification } from 'maplibre-gl'

export const OSLO_CENTER: [number, number] = [10.7522, 59.9139]
export const OSLO_ZOOM = 11

type MapProvider = 'maplibre'

// Ported from Vite's import.meta.env.VITE_* to Next.js's
// process.env.NEXT_PUBLIC_* — see .env.example. Next.js inlines
// NEXT_PUBLIC_ vars at build time, so this only ever runs in the browser
// bundle (this whole module tree is client-only, see KartLoader.tsx).
const provider = (process.env.NEXT_PUBLIC_MAP_PROVIDER as MapProvider) ?? 'maplibre'

function maptilerStyleUrl(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`
}

// Add more providers here (e.g. MapBox, a self-hosted style) and branch on `provider`.
export function getMapStyle(): string | StyleSpecification {
  switch (provider) {
    case 'maplibre':
    default:
      return maptilerStyleUrl()
  }
}
