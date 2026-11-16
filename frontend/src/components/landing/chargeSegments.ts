export interface ChargeSegment {
  state: 'charging' | 'discharging' | 'steady' | 'empty'
  line: string
  area: string
}

/** Display the measured samples; an empty interval has no filled area or colored line. */
export function chargeSegments(values: readonly number[], stepMs: number, durationMs: number): ChargeSegment[] {
  if (values.length < 2 || durationMs <= 0 || stepMs <= 0) return []
  const segments: ChargeSegment[] = []
  const x = (i: number) => Math.min(100, i * stepMs / durationMs * 100)
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i]
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const left = x(i - 1), right = x(i)
    if (right <= left) continue
    const from = Math.max(0, Math.min(1, a)), to = Math.max(0, Math.min(1, b))
    const state = from === 0 && to === 0 ? 'empty' : to < from ? 'discharging' : to > from ? 'charging' : 'steady'
    const line = `${left},${(1 - from) * 100} ${right},${(1 - to) * 100}`
    segments.push({ state, line, area: `${left},100 ${line} ${right},100` })
  }
  return segments
}
