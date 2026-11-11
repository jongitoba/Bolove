'use client'

import dynamic from 'next/dynamic'

// ssr:false is required here (not just "use client"): usePrefersDark reads
// `window` synchronously in its useState initializer, and MapLibre itself
// needs a real DOM/WebGL context, so this whole subtree can only ever run
// in the browser. `dynamic(..., { ssr: false })` is only allowed inside a
// Client Component (this file) — the page.tsx that renders it stays a
// plain Server Component.
const KartApp = dynamic(() => import('./KartApp'), {
  ssr: false,
  loading: () => <p style={{ padding: '2rem' }}>Laster kart …</p>,
})

export default function KartLoader() {
  return <KartApp />
}
