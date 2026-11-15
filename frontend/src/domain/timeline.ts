export interface SunPeriod {
  body: string
  state: string
  start: string
  end: string
  short_shadow?: boolean
}

export type SegmentKind = 'sunlit' | 'shadow' | 'shortShadow'

export interface Segment {
  kind: SegmentKind
  /** Fractions of the Window, 0 to 1. */
  left: number
  width: number
}

export function fractionOf(ms: number, startMs: number, endMs: number): number {
  const span = endMs - startMs
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (ms - startMs) / span))
}

/** Sun periods clipped to the Window, as bands ready to draw. */
export function sunSegments(
  periods: readonly SunPeriod[],
  windowStartMs: number,
  windowEndMs: number,
): Segment[] {
  const segments: Segment[] = []
  for (const period of periods) {
    if (period.body !== 'sun') continue
    const from = Math.max(Date.parse(period.start), windowStartMs)
    const to = Math.min(Date.parse(period.end), windowEndMs)
    if (to <= from) continue
    const left = fractionOf(from, windowStartMs, windowEndMs)
    const right = fractionOf(to, windowStartMs, windowEndMs)
    segments.push({ kind: segmentKind(period), left, width: right - left })
  }
  return segments
}

/** How long the Sun is visible and hidden inside the Window, in milliseconds. */
export function sunTotals(
  periods: readonly SunPeriod[],
  windowStartMs: number,
  windowEndMs: number,
): { visibleMs: number; hiddenMs: number } {
  const span = windowEndMs - windowStartMs
  let visibleMs = 0
  let hiddenMs = 0
  for (const segment of sunSegments(periods, windowStartMs, windowEndMs)) {
    if (segment.kind === 'sunlit') visibleMs += segment.width * span
    else hiddenMs += segment.width * span
  }
  return { visibleMs, hiddenMs }
}

function segmentKind(period: SunPeriod): SegmentKind {
  if (period.state === 'visible') return 'sunlit'
  return period.short_shadow ? 'shortShadow' : 'shadow'
}

/** UTC midnights inside the Window, for the time axis. */
export function dayTicks(windowStartMs: number, windowEndMs: number): number[] {
  const ticks: number[] = []
  const day = 86_400_000
  for (let t = Math.ceil(windowStartMs / day) * day; t < windowEndMs; t += day) {
    ticks.push(t)
  }
  return ticks
}

/** A label closer than this (as a fraction of the Window) to an edge label would overlap it. */
const EDGE_CLEARANCE = 0.12

export interface AxisTick {
  ms: number
  fraction: number
  /** Window start and end are always marked and labelled; midnights in between may be labelled. */
  edge: 'start' | 'end' | null
  label: boolean
}

/**
 * The time axis: a mark at every UTC midnight inside the Window, plus the Window start and end.
 * Midnights are labelled every `labelEvery`-th time, but never next to an edge.
 */
export function axisTicks(windowStartMs: number, windowEndMs: number, maxLabels: number): AxisTick[] {
  const midnights = dayTicks(windowStartMs, windowEndMs).filter((ms) => ms > windowStartMs && ms < windowEndMs)
  const labelEvery = Math.max(1, Math.ceil(midnights.length / maxLabels))
  const edges: AxisTick[] = [
    { ms: windowStartMs, fraction: 0, edge: 'start', label: true },
    { ms: windowEndMs, fraction: 1, edge: 'end', label: true },
  ]
  const inside = midnights.map((ms, index): AxisTick => {
    const fraction = fractionOf(ms, windowStartMs, windowEndMs)
    const clear = fraction >= EDGE_CLEARANCE && fraction <= 1 - EDGE_CLEARANCE
    return { ms, fraction, edge: null, label: clear && index % labelEvery === 0 }
  })
  return [...edges, ...inside]
}

export interface Band {
  kind: 'sun' | 'shortShadow' | 'earth'
  /** Fractions of the Window, 0 to 1. */
  left: number
  width: number
}

/**
 * What the time strip draws: the Sun visible periods and the Short shadows on the Sun row, the
 * Earth visible periods on the Earth row. A long shadow is the bare track.
 */
export function bands(periods: readonly SunPeriod[], windowStartMs: number, windowEndMs: number): { sun: Band[]; earth: Band[] } {
  const out = { sun: [] as Band[], earth: [] as Band[] }
  for (const period of periods) {
    const from = Math.max(Date.parse(period.start), windowStartMs)
    const to = Math.min(Date.parse(period.end), windowEndMs)
    if (to <= from) continue
    const left = fractionOf(from, windowStartMs, windowEndMs)
    const width = fractionOf(to, windowStartMs, windowEndMs) - left
    if (period.body === 'sun' && period.state === 'visible') out.sun.push({ kind: 'sun', left, width })
    else if (period.body === 'sun' && period.short_shadow) out.sun.push({ kind: 'shortShadow', left, width })
    else if (period.body === 'earth' && period.state === 'visible') out.earth.push({ kind: 'earth', left, width })
  }
  return out
}

/** `count` + 1 instants from the Window start to its end, evenly spaced, for the date labels. */
export function evenTicks(windowStartMs: number, windowEndMs: number, count: number): { ms: number; fraction: number }[] {
  const ticks = []
  for (let i = 0; i <= count; i++) {
    ticks.push({ ms: windowStartMs + ((windowEndMs - windowStartMs) * i) / count, fraction: i / count })
  }
  return ticks
}
