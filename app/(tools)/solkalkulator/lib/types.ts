export interface LatLng {
  lat: number
  lng: number
}

export interface AddressResult extends LatLng {
  label: string
}

export interface BuildingData {
  id: string | number
  footprint: LatLng[]
  height: number
  tags: Record<string, string>
  isTarget?: boolean
}

export interface RoadData {
  id: number
  points: LatLng[]
  highway: string
}

export interface SunPosition {
  altitude: number  // radians above horizon
  bearing: number   // 0-360 compass degrees, 0=N clockwise
}

// 0=no sun, 1=blocked/partial, 2=full direct sun
export type SunIntensity = 0 | 1 | 2
