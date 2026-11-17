'use client'

import { useEffect, useRef, useState } from 'react'
import { init, destroy, type SolkalkulatorSelection } from './lib/main'
import Landing from './Landing'
import type { GeocodedAddress } from '@/lib/geocode'
import styles from './solkalkulator.module.css'

interface Props {
  initialAddress?: GeocodedAddress
}

export default function SolkalkulatorApp({ initialAddress }: Props) {
  const [selection, setSelection] = useState<SolkalkulatorSelection | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !selection) return

    init(container, selection, () => setSelection(null))
    return () => destroy(container)
  }, [selection])

  if (!selection) {
    return <Landing onSubmit={setSelection} initialAddress={initialAddress} />
  }

  return <div ref={containerRef} className={styles.mount} />
}
