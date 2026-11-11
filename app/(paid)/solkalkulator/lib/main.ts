import 'maplibre-gl/dist/maplibre-gl.css'
import '../solkalkulator.css'
import { bearingLabel } from './compass'
import { Scene3D } from './scene3d'
import { ReportPanel } from './report'
import { getSunPosition } from './solar'
import type { LatLng, BuildingData } from './types'

// Ported from the standalone balcony-sun app's main.ts, which was a
// top-level imperative script wired directly against `document`. Minimal
// change to make it embeddable: everything is now scoped inside
// init(container)/destroy() instead of running at module load against the
// global document. The screen markup that used to live in index.html is
// injected into `container` by init(). No other restructuring - state
// shape, control flow, and every DOM operation are unchanged, just
// re-scoped from `document.getElementById` to `container.querySelector`.

const SCREENS_HTML = `
  <div id="main-screen" class="screen" style="display:flex">

    <header class="main-header">
      <button class="btn-sm" id="main-back">← Nytt søk</button>
      <h1>Solkalkulator</h1>
      <span id="main-addr"></span>
    </header>

    <div class="main-body">

      <div class="scene-side">
        <div id="scene-canvas"></div>

        <div id="placement-hint" style="display:none">Klikk på den uthevede veggen for å plassere balkongen</div>

        <div class="slider-bar">
          <div class="slider-group">
            <label>Dato: <strong id="date-disp">—</strong></label>
            <input type="range" id="date-slider" min="1" max="365" value="180" />
          </div>
          <div class="slider-group">
            <label>Tid: <strong id="time-disp">—</strong></label>
            <input type="range" id="time-slider" min="0" max="23.75" step="0.25" value="12" />
          </div>
        </div>

        <div id="main-loading" style="display:none">
          <div class="spinner"></div>
          <p>Laster…</p>
        </div>

        <div id="main-error" style="display:none"></div>
      </div>

      <div class="report-side">
        <div id="report-container"></div>
      </div>

    </div>
  </div>
`

export interface SolkalkulatorSelection {
  address: string
  floor: number
  coords: LatLng
}

// The address+floor landing screen now lives in ../Landing.tsx as a plain
// React component styled like the rest of the site (see CLAUDE.md
// "solkalkulator" section) - selection happens there, before this module is
// ever mounted. `init` picks up where that leaves off: it renders straight
// into the main (map + report) screen, which is untouched from the ported
// balcony-sun app.
export function init(container: HTMLElement, selection: SolkalkulatorSelection, onBack: () => void) {
  container.classList.add('solkalkulator-widget')
  container.innerHTML = SCREENS_HTML

  // ── State ────────────────────────────────────────────────────────────────

  const state = {
    address: selection.address,
    floor: selection.floor,
    coords: selection.coords as LatLng | null,
    balconyDir: 180
  }

  // ── Main view ────────────────────────────────────────────────────────────

  let scene: Scene3D | null = null
  let report: ReportPanel | null = null

  container.querySelector('#main-back')!.addEventListener('click', () => {
    onBack()
  })

  function setLoading(on: boolean, msg = 'Henter data…') {
    const el = container.querySelector('#main-loading') as HTMLElement
    el.style.display = on ? 'flex' : 'none'
    el.querySelector('p')!.textContent = msg
  }

  function setError(msg: string) {
    const el = container.querySelector('#main-error') as HTMLElement
    el.textContent = msg
    el.style.display = msg ? 'block' : 'none'
  }

  const placementHint = container.querySelector('#placement-hint') as HTMLElement
  let hintResetTimer: ReturnType<typeof setTimeout> | null = null

  function setHint(msg: string) {
    placementHint.textContent = msg
    placementHint.style.display = msg ? 'block' : 'none'
  }

  function flashRejectionHint() {
    if (hintResetTimer) clearTimeout(hintResetTimer)
    setHint('Klikk på den uthevede bygningen')
    hintResetTimer = setTimeout(() => {
      setHint('Klikk på den uthevede veggen for å plassere balkongen')
    }, 2000)
  }

  async function loadPlacement() {
    setError('')
    setHint('')

    try {
      const coords = state.coords
      if (!coords) throw new Error('Ingen adresse valgt.')

      // 3D map
      const sceneContainer = container.querySelector('#scene-canvas') as HTMLElement
      scene?.dispose()
      scene = new Scene3D(sceneContainer)

      setLoading(true, 'Laster kart- og bygningsdata…')
      const { buildings, roads } = await scene.loadFeaturesAt(coords)
      markTarget(buildings, coords)

      setLoading(false)

      container.querySelector('#main-addr')!.textContent =
        `${state.address} · Etasje ${state.floor}`

      await scene.showPlacementTarget(coords, buildings, roads, state.floor)
      setHint('Klikk på den uthevede veggen for å plassere balkongen')

      scene.setOnWallClick(result => {
        if (result === null || result === 'wrong-building') {
          flashRejectionHint()
          return
        }
        finalizePlacement(coords, buildings, result.bearing)
      })

    } catch (err: unknown) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'En uventet feil oppstod.')
    }
  }

  function finalizePlacement(coords: LatLng, buildings: BuildingData[], bearing: number) {
    if (!scene) return
    if (hintResetTimer) clearTimeout(hintResetTimer)
    setHint('')
    scene.setOnWallClick(null)

    state.balconyDir = bearing
    scene.confirmBalconyPlacement(bearing, state.floor)

    container.querySelector('#main-addr')!.textContent =
      `${state.address} · Etasje ${state.floor} · ${bearing}° ${bearingLabel(bearing)}`

    // Sun exposure is evaluated from the balcony's own outer edge (1m out
    // from the picked wall), not the raw geocoded address point - the
    // address can sit anywhere in the building's footprint, sometimes
    // behind the very wall being tested, which would give wrong occlusion
    // angles against neighbouring buildings. Falls back to `coords` only if
    // the tip can't be derived (shouldn't happen once a wall's been picked).
    const balconyCoords = scene.getBalconyTip(bearing) ?? coords

    const reportEl = container.querySelector('#report-container') as HTMLElement
    report = new ReportPanel(reportEl)
    report.render(balconyCoords, bearing, state.floor, buildings)

    initSliders(coords)
  }

  function markTarget(buildings: BuildingData[], coords: LatLng) {
    let best: BuildingData | null = null
    let bestDist = Infinity

    for (const b of buildings) {
      const lat = b.footprint.reduce((s, p) => s + p.lat, 0) / b.footprint.length
      const lng = b.footprint.reduce((s, p) => s + p.lng, 0) / b.footprint.length
      const d = Math.hypot(lat - coords.lat, lng - coords.lng)
      if (d < bestDist) { bestDist = d; best = b }
    }

    // Only mark as target if centroid is within ~40m
    const metersPerDeg = 111111
    if (best && bestDist * metersPerDeg < 40) best.isTarget = true
  }

  // ── Sliders ──────────────────────────────────────────────────────────────

  function initSliders(coords: LatLng) {
    const dateSlider = container.querySelector('#date-slider') as HTMLInputElement
    const timeSlider = container.querySelector('#time-slider') as HTMLInputElement
    const dateDisp   = container.querySelector('#date-disp')!
    const timeDisp   = container.querySelector('#time-disp')!

    function update() {
      const doy  = parseInt(dateSlider.value)
      const hour = parseFloat(timeSlider.value)
      const date = dayOfYearToDate(doy)
      date.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)

      const monthShort = date.toLocaleDateString('nb-NO', { month: 'short', day: 'numeric' })
      dateDisp.textContent = monthShort
      timeDisp.textContent =
        `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`

      const sun = getSunPosition(date, coords)
      scene?.setSunPosition(sun.altitude, sun.bearing)
      report?.setActiveCell(date.getMonth(), Math.floor(hour))
    }

    dateSlider.addEventListener('input', update)
    timeSlider.addEventListener('input', update)

    const now = new Date()
    dateSlider.value = String(getDoY(now))
    timeSlider.value = String(now.getHours() + now.getMinutes() / 60)
    update()
  }

  function dayOfYearToDate(doy: number): Date {
    const d = new Date(2024, 0, 1)
    d.setDate(doy)
    return d
  }

  function getDoY(d: Date): number {
    const start = new Date(d.getFullYear(), 0, 0)
    return Math.floor((d.getTime() - start.getTime()) / 86_400_000)
  }

  // destroy() runs outside this closure, so it can't reach the local `scene`
  // variable directly - stash just enough (a dispose callback) for it to
  // tear down the live MapLibre instance before wiping the container.
  disposeActiveScene = () => scene?.dispose()

  loadPlacement()
}

let disposeActiveScene: (() => void) | null = null

export function destroy(container: HTMLElement) {
  disposeActiveScene?.()
  disposeActiveScene = null
  container.innerHTML = ''
  container.classList.remove('solkalkulator-widget')
}
