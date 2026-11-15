// Pure helpers: intervals of the Window as fractions ready to draw, and the "Earth up, no dish" gaps.

export interface Span {
  start: string
  end: string
}

export interface Piece {
  /** Fractions of the Window, 0 to 1. */
  left: number
  width: number
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function pieces(spans: readonly Span[], startMs: number, endMs: number): Piece[] {
  const total = endMs - startMs
  if (total <= 0) return []
  const out: Piece[] = []
  for (const span of spans) {
    const left = clamp((Date.parse(span.start) - startMs) / total)
    const right = clamp((Date.parse(span.end) - startMs) / total)
    if (right > left) out.push({ left, width: right - left })
  }
  return out
}

/** The stretches of `outer` not covered by `inner` (both sorted, `inner` inside `outer`). */
export function minus(outer: readonly Span[], inner: readonly Span[]): Span[] {
  const out: Span[] = []
  for (const span of outer) {
    let cursor = Date.parse(span.start)
    const end = Date.parse(span.end)
    for (const cut of inner) {
      const from = Math.max(Date.parse(cut.start), cursor)
      const to = Math.min(Date.parse(cut.end), end)
      if (to <= from) continue
      if (from > cursor) out.push({ start: new Date(cursor).toISOString(), end: new Date(from).toISOString() })
      cursor = to
    }
    if (end > cursor) out.push({ start: new Date(cursor).toISOString(), end: span.end })
  }
  return out
}

/**
 * How much weight the panel gets. Below this share of Earth visible with no dish, the band stays
 * off the timeline and the panel says the two are almost the same (the requirement: weight follows the
 * measured difference).
 */
export const QUIET_SHARE = 0.02

/** `same`: no gap at all; `quiet`: a gap too small to draw; `full`: worth a band of its own. */
export type Weight = 'same' | 'quiet' | 'full'

export function weightOf(earthHours: number, gapHours: number): Weight {
  // The backend's own tolerance on link + gap = Earth visible is 0.01 h.
  if (earthHours <= 0 || gapHours <= 0.01) return 'same'
  return gapHours / earthHours < QUIET_SHARE ? 'quiet' : 'full'
}
