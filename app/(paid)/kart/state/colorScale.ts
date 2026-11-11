// Graduated color scales for the choropleth. Palette values come from the
// project's validated data-viz palette (single-hue sequential ramp for
// magnitude, blue↔red diverging pair with a neutral gray midpoint for
// polarity) — see the dataviz skill's references/palette.md. Sequential
// steps were run through its validate_palette.js in --ordinal mode and
// pass every check (monotone lightness, adjacent step gaps, light-end
// contrast, single hue) for both light and dark surfaces; the diverging
// scale isn't covered by that validator (categorical/sequential only), so
// its light/dark endpoints reuse validated categorical slots (blue #2a78d6
// / red #e34948 and their dark steps) and the two "mild" tints are an
// exact 55%-toward-neutral blend of those, not eyeballed.
const SEQUENTIAL_LIGHT = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281']
const SEQUENTIAL_DARK = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf']

// [strong decrease, mild decrease, ~no change, mild increase, strong increase]
const DIVERGING_LIGHT = ['#e34948', '#eaa4a2', '#f0efec', '#97b9e2', '#2a78d6']
const DIVERGING_DARK = ['#e66767', '#864d4c', '#383835', '#385c84', '#3987e5']

/** Deliberately gray/muted — never a step of either ramp — so "no data" can't be misread as a low value. */
export const NO_DATA_COLOR = '#898781'

export type ScaleKind = 'sequential' | 'diverging'

export interface ColorScale {
  kind: ScaleKind
  /** n+1 ascending boundaries for n color classes. */
  breaks: number[]
  colors: string[]
}

export function computeColorScale(values: number[], kind: ScaleKind, dark: boolean): ColorScale {
  const colors = kind === 'sequential' ? (dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT) : dark ? DIVERGING_DARK : DIVERGING_LIGHT
  const n = colors.length
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)

  if (clean.length === 0) {
    return { kind, breaks: Array(n + 1).fill(0), colors }
  }

  if (kind === 'diverging') {
    // n+1 evenly spaced breaks across [-maxAbs, +maxAbs] — symmetric so
    // that with an odd class count, the middle class straddles "no change".
    const maxAbs = Math.max(Math.abs(clean[0]), Math.abs(clean[clean.length - 1]), 1)
    const breaks: number[] = []
    for (let i = 0; i <= n; i++) breaks.push(-maxAbs + i * ((2 * maxAbs) / n))
    return { kind, breaks, colors }
  }

  // Sequential: quantile breaks so classes have roughly equal membership.
  const breaks = [clean[0]]
  for (let i = 1; i < n; i++) {
    const idx = Math.min(clean.length - 1, Math.floor((i / n) * clean.length))
    breaks.push(clean[idx])
  }
  breaks.push(clean[clean.length - 1])
  return { kind, breaks, colors }
}

export function colorForValue(scale: ColorScale, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_COLOR
  for (let i = 0; i < scale.colors.length; i++) {
    const isLast = i === scale.colors.length - 1
    if (value <= scale.breaks[i + 1] || isLast) return scale.colors[i]
  }
  return scale.colors[scale.colors.length - 1]
}
