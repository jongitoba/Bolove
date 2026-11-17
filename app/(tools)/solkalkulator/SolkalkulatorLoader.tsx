'use client'

import dynamic from 'next/dynamic'
import type { GeocodedAddress } from '@/lib/geocode'

// ssr:false, same reasoning as /kart's KartLoader.tsx: MapLibre needs a real
// DOM/WebGL context, and this subtree (main.ts's init()) is only ever meant
// to run in the browser. dynamic(..., { ssr: false }) is only legal in a
// Client Component, hence this thin loader between the Server Component
// page.tsx and the actual app.
const SolkalkulatorApp = dynamic(() => import('./SolkalkulatorApp'), {
  ssr: false,
  loading: () => <p style={{ padding: '2rem' }}>Laster solkalkulator …</p>,
})

interface Props {
  initialAddress?: GeocodedAddress
}

export default function SolkalkulatorLoader({ initialAddress }: Props) {
  return <SolkalkulatorApp initialAddress={initialAddress} />
}
