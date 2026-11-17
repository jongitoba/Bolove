import * as maplibregl from 'maplibre-gl'
import type { vec3 } from 'gl-matrix'
import type { LatLng, BuildingData, RoadData } from './types'

// Ported from Vite's import.meta.env.VITE_MAPTILER_KEY to Next.js's
// process.env.NEXT_PUBLIC_MAPTILER_KEY — see .env.example. This module only
// ever runs in the browser (mounted client-only, see SolkalkulatorClient.tsx),
// and Next.js inlines NEXT_PUBLIC_ vars at build time.
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY as string
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
const TERRAIN_URL = `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`
const VECTOR_SOURCE = 'maptiler_planet'
const QUERY_RADIUS_M = 60
const BALCONY_DEPTH_M = 1
const BALCONY_WIDTH_M = 2

function toLocal(center: LatLng, point: LatLng): { x: number; z: number } {
  const R = 6371000
  const lat1 = (center.lat * Math.PI) / 180
  const dLat = ((point.lat - center.lat) * Math.PI) / 180
  const dLng = ((point.lng - center.lng) * Math.PI) / 180
  return { x: dLng * Math.cos(lat1) * R, z: -dLat * R }
}

function fromLocal(center: LatLng, x: number, z: number): LatLng {
  const R = 6371000
  const lat1 = (center.lat * Math.PI) / 180
  const lat = center.lat - (z / R) * (180 / Math.PI)
  const lng = center.lng + (x / (R * Math.cos(lat1))) * (180 / Math.PI)
  return { lat, lng }
}

function bearingToXZ(deg: number): { x: number; z: number } {
  const r = (deg * Math.PI) / 180
  return { x: Math.sin(r), z: -Math.cos(r) }
}

function pointToSegmentDistance(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number }
): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// Road width (metres) and color by highway/class
function roadStyle(highway: string): { width: number; color: string } {
  switch (highway) {
    case 'motorway': case 'trunk':              return { width: 12, color: '#888888' }
    case 'primary':                             return { width: 9,  color: '#999999' }
    case 'secondary': case 'tertiary':          return { width: 7,  color: '#aaaaaa' }
    case 'residential': case 'living_street':
    case 'minor': case 'unclassified':          return { width: 5,  color: '#bbbbbb' }
    case 'service':                             return { width: 3,  color: '#cccccc' }
    case 'footway': case 'path':
    case 'cycleway': case 'pedestrian':         return { width: 1.5, color: '#ddccaa' }
    default:                                    return { width: 4,  color: '#bbbbbb' }
  }
}

function buildingHeightFromProps(props: Record<string, unknown>): number {
  const renderHeight = Number(props.render_height)
  if (!isNaN(renderHeight) && renderHeight > 0) return renderHeight
  const height = Number(props.height)
  if (!isNaN(height) && height > 0) return height
  const levels = Number(props.levels ?? props['building:levels'])
  if (!isNaN(levels) && levels > 0) return levels * 3
  return 9
}

function coordsToLatLngRing(coords: unknown): LatLng[] {
  const ring = coords as [number, number][]
  return ring.map(([lng, lat]) => ({ lat, lng }))
}

// Andrew's monotone chain convex hull, for approximating a footprint's shadow silhouette.
function convexHull(points: { x: number; z: number }[]): { x: number; z: number }[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z)
  if (pts.length < 3) return pts
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)

  const lower: { x: number; z: number }[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: { x: number; z: number }[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

type WallPickResult = { bearing: number } | 'wrong-building' | null

export class Scene3D {
  private map: maplibregl.Map
  private ready: Promise<void>
  private sceneCenter: LatLng | null = null
  private sceneBuildings: BuildingData[] = []
  private targetBuilding: BuildingData | null = null
  private targetCenter: LatLng | null = null
  private onWallClick: ((result: WallPickResult) => void) | null = null

  constructor(container: HTMLElement) {
    this.map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [10.75, 59.91],
      zoom: 17,
      pitch: 60,
      bearing: 0
    })

    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    this.map.on('click', e => {
      this.onWallClick?.(this.pickWallBearing(e.point))
    })

    this.ready = new Promise(resolve => {
      this.map.on('load', () => {
        this.addTerrainAndSky()
        this.addEmptyLayers()
        resolve()
      })
    })
  }

  setOnWallClick(cb: ((result: WallPickResult) => void) | null) {
    this.onWallClick = cb
  }

  private hideBaseBuildingLayers() {
    const style = this.map.getStyle()
    for (const layer of style.layers ?? []) {
      if ('source-layer' in layer && layer['source-layer'] === 'building') {
        this.map.setLayoutProperty(layer.id, 'visibility', 'none')
      }
    }
  }

  private addTerrainAndSky() {
    this.map.addSource('terrain-rgb', {
      type: 'raster-dem',
      url: TERRAIN_URL,
      tileSize: 256
    })
    this.map.setTerrain({ source: 'terrain-rgb', exaggeration: 1 })

    this.map.setSky({
      'sky-color': '#87ceeb',
      'horizon-color': '#ffffff',
      'fog-color': '#ffffff',
      'sky-horizon-blend': 0.8,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.4
    })
  }

  private addEmptyLayers() {
    const empty = { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] }

    this.map.addSource('buildings-src', { type: 'geojson', data: empty })
    this.map.addLayer({
      id: 'buildings-layer',
      type: 'fill-extrusion',
      source: 'buildings-src',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92
      }
    })

    this.map.addSource('roads-src', { type: 'geojson', data: empty })
    this.map.addLayer({
      id: 'roads-layer',
      type: 'line',
      source: 'roads-src',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width']
      }
    })

    this.map.addSource('floor-band-src', { type: 'geojson', data: empty })
    this.map.addLayer({
      id: 'floor-band-layer',
      type: 'fill-extrusion',
      source: 'floor-band-src',
      paint: {
        'fill-extrusion-color': '#ffcc00',
        'fill-extrusion-height': ['get', 'top'],
        'fill-extrusion-base': ['get', 'bottom'],
        'fill-extrusion-opacity': 0.35
      }
    })

    this.map.addSource('balcony-face-src', { type: 'geojson', data: empty })
    this.map.addLayer({
      id: 'balcony-face-layer',
      type: 'fill-extrusion',
      source: 'balcony-face-src',
      paint: {
        'fill-extrusion-color': '#ff6600',
        'fill-extrusion-height': ['get', 'top'],
        'fill-extrusion-base': ['get', 'bottom'],
        'fill-extrusion-opacity': 0.9
      }
    })

    // Rendered after the buildings so shadow volumes visibly darken neighboring facades,
    // not just the ground plane.
    this.map.addSource('shadows-src', { type: 'geojson', data: empty })
    this.map.addLayer({
      id: 'shadows-layer',
      type: 'fill-extrusion',
      source: 'shadows-src',
      paint: {
        'fill-extrusion-color': '#0a1020',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.35
      }
    })

    this.map.addSource('balcony-arrow-src', { type: 'geojson', data: empty })
    this.map.addLayer({
      id: 'balcony-arrow-layer',
      type: 'line',
      source: 'balcony-arrow-src',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#ff6600', 'line-width': 3 }
    })
    this.map.addLayer({
      id: 'balcony-arrow-tip',
      type: 'circle',
      source: 'balcony-arrow-src',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': '#ff6600', 'circle-radius': 6 }
    })

    this.map.addSource('compass-src', { type: 'geojson', data: empty })
    this.map.addLayer({
      id: 'compass-labels',
      type: 'symbol',
      source: 'compass-src',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 16,
        'text-font': ['Noto Sans Bold']
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000000',
        'text-halo-width': 1.2
      }
    })
  }

  // Pull building/road geometry out of MapTiler's loaded vector tiles instead of Overpass.
  async loadFeaturesAt(center: LatLng): Promise<{ buildings: BuildingData[]; roads: RoadData[] }> {
    await this.ready
    await new Promise<void>(resolve => {
      this.map.once('idle', () => resolve())
      this.map.jumpTo({ center: [center.lng, center.lat], zoom: 18 })
    })

    const buildingFeatures = this.map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'building' })
    const roadFeatures = this.map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'transportation' })

    const buildings: BuildingData[] = []
    const seenBuildings = new Set<string>()
    for (const f of buildingFeatures) {
      const geom = f.geometry
      const rings = geom.type === 'Polygon' ? [geom.coordinates[0]]
        : geom.type === 'MultiPolygon' ? geom.coordinates.map((p: number[][][]) => p[0])
        : []
      for (const ring of rings) {
        const footprint = coordsToLatLngRing(ring)
        if (footprint.length < 3) continue
        const cLat = footprint.reduce((s, p) => s + p.lat, 0) / footprint.length
        const cLng = footprint.reduce((s, p) => s + p.lng, 0) / footprint.length
        if (haversine(center, { lat: cLat, lng: cLng }) > QUERY_RADIUS_M) continue
        const key = `${cLat.toFixed(6)},${cLng.toFixed(6)}`
        if (seenBuildings.has(key)) continue
        seenBuildings.add(key)
        buildings.push({
          id: String(f.id ?? key),
          footprint,
          height: buildingHeightFromProps(f.properties ?? {}),
          tags: f.properties as Record<string, string>
        })
      }
    }

    const roads: RoadData[] = []
    const seenRoads = new Set<string>()
    let roadId = 0
    for (const f of roadFeatures) {
      const geom = f.geometry
      const lines = geom.type === 'LineString' ? [geom.coordinates]
        : geom.type === 'MultiLineString' ? geom.coordinates
        : []
      const props = f.properties ?? {}
      const cls = props.class === 'path' ? (props.subclass ?? 'path') : (props.class ?? 'unclassified')
      for (const line of lines) {
        const points = coordsToLatLngRing(line)
        if (points.length < 2) continue
        const mid = points[Math.floor(points.length / 2)]
        if (haversine(center, mid) > QUERY_RADIUS_M) continue
        const key = `${cls}:${mid.lat.toFixed(6)},${mid.lng.toFixed(6)}`
        if (seenRoads.has(key)) continue
        seenRoads.add(key)
        roads.push({ id: roadId++, points, highway: cls })
      }
    }

    return { buildings, roads }
  }

  // Renders the buildings/roads and highlights the target building's floor
  // band, but doesn't place a balcony yet - the user picks the wall by
  // clicking, via pickWallBearing (wired through the `click` listener set
  // up in the constructor and the setOnWallClick callback). The camera
  // starts at the normal pitch-60 angle and the user is free to rotate/tilt
  // it (via the NavigationControl) to see whichever wall they want to pick -
  // pickWallBearing does real 3D ray-casting (see below), so it stays
  // correct at any camera orientation.
  async showPlacementTarget(center: LatLng, buildings: BuildingData[], roads: RoadData[], floor: number) {
    await this.ready
    this.hideBaseBuildingLayers()
    this.sceneCenter = center
    this.sceneBuildings = buildings

    const buildingFeatures: GeoJSON.Feature[] = buildings.map((b, buildingIndex) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [b.footprint.map(p => [p.lng, p.lat])] },
      properties: { height: b.height, color: b.isTarget ? '#3355aa' : '#c8b89a', buildingIndex }
    }))
    this.setData('buildings-src', buildingFeatures)

    const roadFeatures: GeoJSON.Feature[] = roads.map(r => {
      const { width, color } = roadStyle(r.highway)
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: r.points.map(p => [p.lng, p.lat]) },
        properties: { width, color }
      }
    })
    this.setData('roads-src', roadFeatures)

    const target = buildings.find(b => b.isTarget) ?? null
    this.targetBuilding = target
    this.targetCenter = target ? this.footprintCentroid(target) : center
    this.setData('balcony-face-src', [])
    this.setData('balcony-arrow-src', [])
    this.setData('floor-band-src', target ? [this.buildFloorBand(target, center, floor)] : [])
    this.setData('compass-src', this.buildCompassLabels(center))

    this.map.flyTo({ center: [this.targetCenter.lng, this.targetCenter.lat], zoom: 18, pitch: 60, essential: true })
  }

  // Draws the balcony face + direction arrow once a wall has been picked,
  // and clears the floor-band highlight since placement is now confirmed.
  confirmBalconyPlacement(dir: number, floor: number) {
    const center = this.sceneCenter
    const target = this.targetBuilding
    if (!center || !target || !this.targetCenter) return

    const face = this.buildBalconyFace(target, center, dir, floor)
    this.setData('balcony-face-src', face ? [face] : [])
    this.setData('balcony-arrow-src', this.buildBalconyArrow(this.targetCenter, dir))
    this.setData('floor-band-src', [])
  }

  // Real 3D ray-casting against each wall's actual plane. This is what makes
  // picking work correctly regardless of how the user has rotated/tilted the
  // camera: earlier attempts either approximated with 2D screen-space angle
  // math (broke down once a wall's height caused enough parallax) or leaned
  // on queryRenderedFeatures (which, for fill-extrusion layers, hit-tests
  // each building's flat ground footprint rather than its actual extruded
  // shape - confirmed by clicking squarely on a rendered wall and getting
  // zero/wrong results back).
  //
  // The ray itself: transform.getRayDirectionFromPixel() looks like the
  // obvious way to get it, but it's only implemented for globe projection in
  // this MapLibre version - it throws "Not implemented." for the default
  // Mercator transform we actually use. map.unproject(point) sidesteps that
  // entirely: it always returns the ray's exact intersection with the
  // ground (z=0) plane, which combined with the camera's real position
  // gives the same ray direction with no dependency on that API at all.
  //
  // transform.cameraPosition looks like the obvious way to get the camera's
  // position too, but it's in a different internal coordinate convention
  // (confirmed empirically: values on the order of the world size in pixels,
  // not the 0..1 range MercatorCoordinate uses) - subtracting it from a
  // MercatorCoordinate silently produced a "ray direction" dominated by that
  // scale mismatch, which pointed roughly the same way regardless of the
  // actual click. transform.getCameraLngLat() / getCameraAltitude() are the
  // documented, public way to get the camera's real geographic position;
  // converting that through MercatorCoordinate.fromLngLat keeps everything
  // in one consistent coordinate space.
  private pickWallBearing(point: maplibregl.Point): WallPickResult {
    const center = this.sceneCenter
    if (!center) return null

    const camMerc = maplibregl.MercatorCoordinate.fromLngLat(this.map.transform.getCameraLngLat(), this.map.transform.getCameraAltitude())
    const camPos: vec3 = [camMerc.x, camMerc.y, camMerc.z]
    const groundLL = this.map.unproject(point)
    const groundMerc = maplibregl.MercatorCoordinate.fromLngLat(groundLL, 0)
    const rayDir: vec3 = [groundMerc.x - camPos[0], groundMerc.y - camPos[1], groundMerc.z - camPos[2]]

    const target = this.targetBuilding
    if (target) {
      const bearing = this.intersectBuildingWalls(camPos, rayDir, target)
      if (bearing !== null) return { bearing }
    }

    // The ray missed every wall of the target (e.g. a click on open sky, the
    // roof cap, or another building). Fall back to a coarse ground-click
    // test across all buildings just to decide whether to show the
    // "wrong building" hint - this doesn't need to be wall-precise.
    const p = toLocal(center, { lat: groundLL.lat, lng: groundLL.lng })
    const hit = this.sceneBuildings.find(b => this.pointInFootprint(p, b, center))
    if (!hit) return null
    return hit.isTarget ? { bearing: this.nearestEdgeBearing(p, hit, center) } : 'wrong-building'
  }

  // Intersects the ray with each footprint edge's wall plane (built from the
  // edge's two ground corners plus one corner raised to the building's
  // height) and returns the bearing of the nearest wall actually hit within
  // its bounds, or null if the ray misses every wall.
  private intersectBuildingWalls(camPos: vec3, rayDir: vec3, b: BuildingData): number | null {
    const center = this.sceneCenter
    if (!center) return null

    const localPts = b.footprint.map(ll => toLocal(center, ll))
    const cx = localPts.reduce((s, p) => s + p.x, 0) / localPts.length
    const cz = localPts.reduce((s, p) => s + p.z, 0) / localPts.length

    let bestT = Infinity
    let bestBearing: number | null = null

    for (let i = 0; i < b.footprint.length; i++) {
      const aLL = b.footprint[i]
      const cLL = b.footprint[(i + 1) % b.footprint.length]

      const aBottom = maplibregl.MercatorCoordinate.fromLngLat(aLL, 0)
      const cBottom = maplibregl.MercatorCoordinate.fromLngLat(cLL, 0)
      const aTop = maplibregl.MercatorCoordinate.fromLngLat(aLL, b.height)

      // u (along the edge, at ground level) and v (straight up) are exactly
      // orthogonal by construction, since u has no z component and v has no
      // x/y component - that keeps the bounds check below a simple 1D
      // projection instead of needing a full non-orthogonal basis solve.
      const ux = cBottom.x - aBottom.x
      const uy = cBottom.y - aBottom.y
      const vz = aTop.z - aBottom.z
      if (Math.abs(vz) < 1e-12) continue

      const nx = uy * vz
      const ny = -ux * vz

      const denom = rayDir[0] * nx + rayDir[1] * ny
      if (Math.abs(denom) < 1e-12) continue

      const dx = aBottom.x - camPos[0]
      const dy = aBottom.y - camPos[1]
      const t = (dx * nx + dy * ny) / denom
      if (t <= 0 || t >= bestT) continue

      const ix = camPos[0] + rayDir[0] * t
      const iy = camPos[1] + rayDir[1] * t
      const iz = camPos[2] + rayDir[2] * t

      const uLenSq = ux * ux + uy * uy
      if (uLenSq < 1e-20) continue
      const s = ((ix - aBottom.x) * ux + (iy - aBottom.y) * uy) / uLenSq
      const h = (iz - aBottom.z) / vz
      if (s < 0 || s > 1 || h < 0 || h > 1) continue

      bestT = t
      const p1 = localPts[i]
      const p2 = localPts[(i + 1) % localPts.length]
      const mx = (p1.x + p2.x) / 2 - cx
      const mz = (p1.z + p2.z) / 2 - cz
      bestBearing = ((Math.atan2(mx, -mz) * 180) / Math.PI + 360) % 360
    }

    return bestBearing
  }

  private pointInFootprint(p: { x: number; z: number }, b: BuildingData, center: LatLng): boolean {
    const pts = b.footprint.map(ll => toLocal(center, ll))
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]
      const c = pts[j]
      const intersects = a.z > p.z !== c.z > p.z && p.x < ((c.x - a.x) * (p.z - a.z)) / (c.z - a.z) + a.x
      if (intersects) inside = !inside
    }
    return inside
  }

  private nearestEdgeBearing(p: { x: number; z: number }, b: BuildingData, center: LatLng): number {
    const pts = b.footprint.map(ll => toLocal(center, ll))
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length
    const cz = pts.reduce((s, q) => s + q.z, 0) / pts.length

    let bestDist = Infinity
    let bestBearing = 0
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i]
      const p2 = pts[(i + 1) % pts.length]
      const dist = pointToSegmentDistance(p, p1, p2)
      if (dist < bestDist) {
        bestDist = dist
        const mx = (p1.x + p2.x) / 2 - cx
        const mz = (p1.z + p2.z) / 2 - cz
        bestBearing = ((Math.atan2(mx, -mz) * 180) / Math.PI + 360) % 360
      }
    }
    return bestBearing
  }

  private footprintCentroid(b: BuildingData): LatLng {
    return {
      lat: b.footprint.reduce((s, p) => s + p.lat, 0) / b.footprint.length,
      lng: b.footprint.reduce((s, p) => s + p.lng, 0) / b.footprint.length
    }
  }

  // A slightly outset copy of the target building's footprint, extruded
  // just for the chosen floor's height band, so the user can see where
  // they're able to click before a wall is picked.
  private buildFloorBand(b: BuildingData, center: LatLng, floor: number): GeoJSON.Feature {
    const pts = b.footprint.map(ll => toLocal(center, ll))
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length
    const OFFSET_M = 0.6

    const ring = pts.map(p => {
      const dx = p.x - cx
      const dz = p.z - cz
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      return fromLocal(center, p.x + (dx / len) * OFFSET_M, p.z + (dz / len) * OFFSET_M)
    })
    ring.push(ring[0])

    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring.map(p => [p.lng, p.lat])] },
      properties: { bottom: (floor - 1) * 3, top: floor * 3 }
    }
  }

  // Finds which footprint edge was picked: the one whose outward-facing
  // midpoint direction is closest to `dir` - this is exactly how the wall's
  // bearing was derived in the first place (intersectBuildingWalls /
  // nearestEdgeBearing), so re-deriving it from `dir` alone here reproduces
  // the same edge without needing to plumb the picked edge index through.
  private findWallEdge(
    b: BuildingData,
    center: LatLng,
    dir: number
  ): { p1: { x: number; z: number }; p2: { x: number; z: number } } | null {
    const pts = b.footprint.map(ll => toLocal(center, ll))
    if (pts.length < 2) return null
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length
    const faceVec = bearingToXZ(dir)

    let bestIdx = 0, bestDot = -Infinity
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i]
      const p2 = pts[(i + 1) % pts.length]
      const mx = (p1.x + p2.x) / 2 - cx
      const mz = (p1.z + p2.z) / 2 - cz
      const len = Math.sqrt(mx * mx + mz * mz) || 1
      const dot = (mx / len) * faceVec.x + (mz / len) * faceVec.z
      if (dot > bestDot) { bestDot = dot; bestIdx = i }
    }

    return { p1: pts[bestIdx], p2: pts[(bestIdx + 1) % pts.length] }
  }

  // A 1m-deep deck, BALCONY_WIDTH_M wide, centred on the picked wall and
  // extruded straight out from it (not flush against it, unlike the
  // building's own wall face) - this is what the user actually stands on,
  // and getBalconyTip below reports where its outer edge ends up so sun
  // exposure is evaluated from there, not from the building's wall or the
  // raw geocoded address point.
  private buildBalconyFace(b: BuildingData, center: LatLng, dir: number, floor: number): GeoJSON.Feature | null {
    const edge = this.findWallEdge(b, center, dir)
    if (!edge) return null
    const { p1, p2 } = edge

    const dx = p2.x - p1.x
    const dz = p2.z - p1.z
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    const ux = dx / len
    const uz = dz / len
    const faceVec = bearingToXZ(dir)

    const mx = (p1.x + p2.x) / 2
    const mz = (p1.z + p2.z) / 2
    const halfWidth = BALCONY_WIDTH_M / 2

    const innerLeft = { x: mx - ux * halfWidth, z: mz - uz * halfWidth }
    const innerRight = { x: mx + ux * halfWidth, z: mz + uz * halfWidth }
    const outerRight = { x: innerRight.x + faceVec.x * BALCONY_DEPTH_M, z: innerRight.z + faceVec.z * BALCONY_DEPTH_M }
    const outerLeft = { x: innerLeft.x + faceVec.x * BALCONY_DEPTH_M, z: innerLeft.z + faceVec.z * BALCONY_DEPTH_M }

    const quad: LatLng[] = [innerLeft, innerRight, outerRight, outerLeft].map(p => fromLocal(center, p.x, p.z))
    quad.push(quad[0])

    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [quad.map(p => [p.lng, p.lat])] },
      properties: { bottom: (floor - 1) * 3, top: floor * 3 }
    }
  }

  // The point BALCONY_DEPTH_M out from the picked wall's midpoint, along
  // its outward-facing bearing - i.e. the outer edge of the rendered
  // balcony deck. This is the position sun-exposure should be evaluated
  // from (see main.ts), since standing at the raw address point (which can
  // sit anywhere in the building's footprint, sometimes behind the very
  // wall being tested) gives systematically wrong occlusion angles against
  // neighbouring buildings.
  getBalconyTip(dir: number): LatLng | null {
    const target = this.targetBuilding
    const center = this.sceneCenter
    if (!target || !center) return null

    const edge = this.findWallEdge(target, center, dir)
    if (!edge) return null

    const mx = (edge.p1.x + edge.p2.x) / 2
    const mz = (edge.p1.z + edge.p2.z) / 2
    const faceVec = bearingToXZ(dir)
    return fromLocal(center, mx + faceVec.x * BALCONY_DEPTH_M, mz + faceVec.z * BALCONY_DEPTH_M)
  }

  private buildBalconyArrow(centroid: LatLng, dir: number): GeoJSON.Feature[] {
    const v = bearingToXZ(dir)
    const arrowLen = 15
    const tip = fromLocal(centroid, v.x * arrowLen, v.z * arrowLen)
    return [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[centroid.lng, centroid.lat], [tip.lng, tip.lat]] },
        properties: {}
      },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [tip.lng, tip.lat] }, properties: {} }
    ]
  }

  private buildCompassLabels(center: LatLng): GeoJSON.Feature[] {
    const entries: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
    return entries.map(([label, deg]) => {
      const v = bearingToXZ(deg)
      const p = fromLocal(center, v.x * 55, v.z * 55)
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { label, color: label === 'N' ? '#ff5555' : '#ffffff' }
      }
    })
  }

  // MapLibre (unlike Mapbox's proprietary Standard style) doesn't cast real shadows, so we
  // approximate each building's shadow as a staircase of translucent volumes: bands swept
  // along the shadow direction whose height steps down from ~the caster's own height near
  // the wall to ~0 at the shadow's tip (real shadow height falls off linearly with distance:
  // h(d) = height - d·tan(altitude)). Rendered after the buildings layer, these volumes
  // visibly darken whatever neighboring facade they overlap.
  private computeShadows(altitude: number, bearing: number): GeoJSON.Feature[] {
    const center = this.sceneCenter
    if (!center || altitude <= 0.02) return []

    const shadowDir = bearingToXZ((bearing + 180) % 360)
    const features: GeoJSON.Feature[] = []
    // Aim for one band roughly every 0.6m of shadow length, so the stepped roofline reads
    // as a smooth slope rather than a staircase — fill-extrusion has no per-vertex height,
    // so a literal straight ramp isn't possible without a custom WebGL layer.
    const STEP_LENGTH_M = 0.6
    const MAX_STEPS = 60

    for (const b of this.sceneBuildings) {
      const len = Math.min(b.height / Math.tan(altitude), 200)
      if (len < 0.5) continue

      const rawFootprint = b.footprint.map(ll => toLocal(center, ll))
      const cx = rawFootprint.reduce((s, p) => s + p.x, 0) / rawFootprint.length
      const cz = rawFootprint.reduce((s, p) => s + p.z, 0) / rawFootprint.length

      // Shrink the band touching the building slightly inward so it sits just inside the
      // caster's own walls — otherwise its coincident footprint z-fights with the
      // building's own opaque extrusion.
      const shrunkFootprint = rawFootprint.map(p => ({ x: cx + (p.x - cx) * 0.85, z: cz + (p.z - cz) * 0.85 }))

      const steps = Math.min(MAX_STEPS, Math.max(4, Math.round(len / STEP_LENGTH_M)))
      for (let i = 0; i < steps; i++) {
        const d0 = (len * i) / steps
        const d1 = (len * (i + 1)) / steps
        const height = Math.max(0.5, b.height * (1 - i / steps) - 1)

        const nearFootprint = i === 0 ? shrunkFootprint : rawFootprint
        const nearPts = nearFootprint.map(p => ({ x: p.x + shadowDir.x * d0, z: p.z + shadowDir.z * d0 }))
        const farPts = rawFootprint.map(p => ({ x: p.x + shadowDir.x * d1, z: p.z + shadowDir.z * d1 }))
        const hull = convexHull([...nearPts, ...farPts])
        if (hull.length < 3) continue

        const ring = hull.map(p => fromLocal(center, p.x, p.z))
        ring.push(ring[0])
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring.map(p => [p.lng, p.lat])] },
          properties: { height }
        })
      }
    }

    return features
  }

  private setData(sourceId: string, features: GeoJSON.Feature[]) {
    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
    source?.setData({ type: 'FeatureCollection', features })
  }

  setSunPosition(altitude: number, bearing: number) {
    if (!this.map.isStyleLoaded()) return

    if (altitude <= 0) {
      this.map.setLight({ anchor: 'map', color: '#88a0cc', intensity: 0.1, position: [1.5, bearing, 95] })
      this.setData('shadows-src', [])
      return
    }

    const altitudeDeg = (altitude * 180) / Math.PI
    const t = Math.sin(altitude)
    const intensity = 0.3 + t * 0.35
    const polar = 90 - altitudeDeg
    const warmth = t > 0.5 ? '#fff5e0' : '#ffcf8a'

    this.map.setLight({ anchor: 'map', color: warmth, intensity, position: [1.5, bearing, polar] })
    this.setData('shadows-src', this.computeShadows(altitude, bearing))
  }

  dispose() {
    this.map.remove()
  }
}
