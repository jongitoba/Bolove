import * as SunCalc from 'suncalc'
import type { LatLng, BuildingData, SunPosition, SunIntensity } from './types'

export function getSunPosition(date: Date, coords: LatLng): SunPosition {
  const pos = SunCalc.getPosition(date, coords.lat, coords.lng)
  // suncalc azimuth: 0=south, positive=west. Convert to compass bearing 0=N clockwise.
  const bearing = (180 + (pos.azimuth * 180) / Math.PI + 360) % 360
  return { altitude: pos.altitude, bearing }
}

// Haversine bearing and distance between two lat/lng points
function bearingAndDistance(from: LatLng, to: LatLng): { bearing: number; distance: number } {
  const R = 6371000
  const lat1 = (from.lat * Math.PI) / 180
  const lat2 = (to.lat * Math.PI) / 180
  const dLat = ((to.lat - from.lat) * Math.PI) / 180
  const dLng = ((to.lng - from.lng) * Math.PI) / 180

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360

  return { bearing, distance }
}

// Signed angular difference a→b, range [-180, 180]
function angleDelta(a: number, b: number): number {
  const d = (b - a) % 360
  if (d > 180) return d - 360
  if (d < -180) return d + 360
  return d
}

// Check if the building footprint corners span across the given sun bearing
function sunWithinAngularSpan(sunBearing: number, cornerBearings: number[]): boolean {
  if (cornerBearings.length === 0) return false
  const deltas = cornerBearings.map(b => angleDelta(sunBearing, b))
  return Math.min(...deltas) <= 0 && Math.max(...deltas) >= 0
}

function isBuildingBlocking(
  sunPos: SunPosition,
  balconyCoords: LatLng,
  balconyHeight: number,
  building: BuildingData
): boolean {
  const effectiveHeight = building.height - balconyHeight
  if (effectiveHeight <= 0) return false

  const corners = building.footprint
  let minDist = Infinity
  const bearings: number[] = []

  for (const corner of corners) {
    const { bearing, distance } = bearingAndDistance(balconyCoords, corner)
    bearings.push(bearing)
    if (distance < minDist) minDist = distance
  }

  // Ignore the building the balcony is ON (very close)
  if (minDist < 5) return false

  // Angular height of the building's top above the balcony
  const angularHeight = Math.atan2(effectiveHeight, minDist)
  if (sunPos.altitude >= angularHeight) return false

  return sunWithinAngularSpan(sunPos.bearing, bearings)
}

export function getSunIntensity(
  sunPos: SunPosition,
  balconyDirection: number,
  balconyHeight: number,
  buildings: BuildingData[],
  balconyCoords: LatLng
): SunIntensity {
  if (sunPos.altitude <= 0) return 0

  // Sun must be within the forward 180° arc of the balcony (±90° from facing direction)
  const diff = Math.abs(angleDelta(balconyDirection, sunPos.bearing))
  if (diff > 90) return 0

  for (const building of buildings) {
    if (building.isTarget) continue
    if (isBuildingBlocking(sunPos, balconyCoords, balconyHeight, building)) return 1
  }

  return 2
}

export function computeHeatmap(
  coords: LatLng,
  balconyDirection: number,
  floorNumber: number,
  buildings: BuildingData[]
): SunIntensity[][] {
  const balconyHeight = floorNumber * 3

  // [month 0-11][hourIdx 0-15] for hours 6–21
  return Array.from({ length: 12 }, (_, month) =>
    Array.from({ length: 16 }, (_, hourIdx) => {
      const hour = hourIdx + 6
      const date = new Date(2024, month, 15, hour, 0, 0)
      const sunPos = getSunPosition(date, coords)
      return getSunIntensity(sunPos, balconyDirection, balconyHeight, buildings, coords)
    })
  )
}

export function dailySunHours(heatmap: SunIntensity[][]): number[] {
  return heatmap.map(row => row.filter(v => v > 0).length)
}
