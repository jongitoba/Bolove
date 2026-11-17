import { computeHeatmap, dailySunHours } from './solar'
import type { LatLng, BuildingData, SunIntensity } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des']
const MONTH_FULL = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember']

export class ReportPanel {
  private el: HTMLElement
  private heatmap: SunIntensity[][] = []
  private activeMonth = new Date().getMonth()
  private activeHour = 12

  constructor(container: HTMLElement) {
    this.el = container
  }

  render(coords: LatLng, direction: number, floor: number, buildings: BuildingData[]) {
    this.el.innerHTML = '<div class="report-loading">Beregner soldata…</div>'
    // Yield to let the browser paint first
    setTimeout(() => {
      this.heatmap = computeHeatmap(coords, direction, floor, buildings)
      this.renderFull()
    }, 20)
  }

  setActiveCell(month: number, hour: number) {
    this.activeMonth = month
    this.activeHour = Math.max(6, Math.min(21, hour))
    this.syncActiveCell()
  }

  private renderFull() {
    const hours = dailySunHours(this.heatmap)
    const maxH = Math.max(...hours, 1)
    const annualAvg = (hours.reduce((a, b) => a + b, 0) / 12).toFixed(1)
    const bestIdx = hours.indexOf(Math.max(...hours))

    this.el.innerHTML = `
      <div class="report">
        <h2 class="report-title">Solrapport</h2>

        <div class="summary-row">
          <div class="summary-card">
            <span class="sc-label">Årlig snitt</span>
            <span class="sc-value">${annualAvg}t<span class="sc-unit">/dag</span></span>
          </div>
          <div class="summary-card">
            <span class="sc-label">Beste måned</span>
            <span class="sc-value">${MONTHS[bestIdx]}<span class="sc-unit"> ${hours[bestIdx]}t</span></span>
          </div>
        </div>

        <h3 class="section-title">Daglige soltimer per måned</h3>
        <div class="bar-chart">
          ${hours.map((h, i) => `
            <div class="bar-col${i === this.activeMonth ? ' bar-active' : ''}" data-month="${i}">
              <div class="bar-inner" style="height:${Math.round((h / maxH) * 70)}px">
                <span class="bar-val">${h}</span>
              </div>
              <span class="bar-lbl">${MONTHS[i]}</span>
            </div>
          `).join('')}
        </div>

        <h3 class="section-title">Solintensitetskart</h3>
        <div class="heatmap-wrap">
          <div class="heatmap-hour-row">
            <span class="hm-month-spacer"></span>
            ${Array.from({ length: 16 }, (_, i) => `<span class="hm-hour-lbl">${i + 6}</span>`).join('')}
          </div>
          <div class="heatmap-body" id="hm-body">
            ${this.heatmap.map((row, m) => `
              <div class="hm-row">
                <span class="hm-month-lbl">${MONTHS[m]}</span>
                ${row.map((v, hi) => `
                  <div class="hm-cell i${v}${m === this.activeMonth && hi + 6 === this.activeHour ? ' hm-active' : ''}"
                       data-m="${m}" data-h="${hi + 6}"
                       title="${MONTH_FULL[m]} ${hi + 6}:00 — ${['Ingen sol', 'Delvis sol', 'Full sol'][v]}">
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        </div>

        <div class="peak-window" id="peak-win">
          ${this.peakWindowHTML()}
        </div>

        <div class="legend">
          <span class="leg-item"><span class="leg-dot i0"></span>Ingen sol</span>
          <span class="leg-item"><span class="leg-dot i1"></span>Delvis sol</span>
          <span class="leg-item"><span class="leg-dot i2"></span>Full sol</span>
        </div>
      </div>
    `

    // Bar chart click
    this.el.querySelectorAll('.bar-col').forEach(el => {
      el.addEventListener('click', () => {
        const m = parseInt((el as HTMLElement).dataset.month!)
        this.activeMonth = m
        this.syncActiveCell()
      })
    })
  }

  private peakWindowHTML(): string {
    const row = this.heatmap[this.activeMonth]
    if (!row) return ''
    let start = -1, end = -1
    for (let i = 0; i < row.length; i++) {
      if (row[i] === 2) {
        if (start === -1) start = i + 6
        end = i + 6
      }
    }
    const month = MONTH_FULL[this.activeMonth]
    if (start === -1) return `<p class="peak-none">Ingen direkte sol i ${month}</p>`
    return `<p class="peak-info"><strong>${month}</strong> — Direkte sol <strong>${start}:00–${end + 1}:00</strong></p>`
  }

  private syncActiveCell() {
    const body = this.el.querySelector('#hm-body')
    if (!body) return

    body.querySelectorAll('.hm-cell').forEach(c => c.classList.remove('hm-active'))
    body.querySelectorAll('.hm-row').forEach((r, i) => r.classList.toggle('hm-row-active', i === this.activeMonth))

    const cell = body.querySelector(`[data-m="${this.activeMonth}"][data-h="${this.activeHour}"]`)
    cell?.classList.add('hm-active')

    const peak = this.el.querySelector('#peak-win')
    if (peak) peak.innerHTML = this.peakWindowHTML()

    this.el.querySelectorAll('.bar-col').forEach((el, i) => {
      el.classList.toggle('bar-active', i === this.activeMonth)
    })
  }
}
