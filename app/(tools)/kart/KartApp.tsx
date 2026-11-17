'use client'

import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import DetailPanel from './components/DetailPanel'
import { LayersProvider } from './state/LayersProvider'
import { HousingStatsProvider } from './state/HousingStatsProvider'
import styles from './kart.module.css'

export default function KartApp() {
  return (
    <LayersProvider>
      <HousingStatsProvider>
        <div className={styles['app-shell']}>
          <Sidebar />
          <MapView />
          <DetailPanel />
        </div>
      </HousingStatsProvider>
    </LayersProvider>
  )
}
