/** The Resolution ladder in words: how far the coarsest rung moves the answer from the finest. */

export interface RungEvent {
  t: string
}

export interface Rung {
  resolution_m: number
  next_sunset: RungEvent | null
  next_earthset: RungEvent | null
}

/** Below a minute the rungs agree, as far as the screen says times. */
const SAME_MS = 60_000

export type LadderVerdict =
  | { kind: 'later' | 'earlier'; event: 'sunset' | 'earthset'; ms: number; coarse: number; fine: number }
  | { kind: 'same'; event: 'sunset' | 'earthset' }
  | { kind: 'only'; event: 'sunset' | 'earthset'; resolution: number }
  | { kind: 'none' }

function compare(coarse: Rung, fine: Rung, event: 'sunset' | 'earthset'): LadderVerdict | null {
  const at = (rung: Rung) => (event === 'sunset' ? rung.next_sunset : rung.next_earthset)
  const a = at(coarse)
  const b = at(fine)
  if (a === null && b === null) return null
  if (a === null || b === null) {
    return { kind: 'only', event, resolution: (a === null ? fine : coarse).resolution_m }
  }
  const ms = Date.parse(a.t) - Date.parse(b.t)
  if (Math.abs(ms) < SAME_MS) return { kind: 'same', event }
  return {
    kind: ms > 0 ? 'later' : 'earlier',
    event,
    ms: Math.abs(ms),
    coarse: coarse.resolution_m,
    fine: fine.resolution_m,
  }
}

/**
 * The sentence the panel opens with: the coarsest rung against the finest, on the next Sunset,
 * or on the next Earthset when neither rung has a Sunset in the Window.
 */
export function ladderVerdict(rungs: readonly Rung[]): LadderVerdict {
  if (rungs.length < 2) return { kind: 'none' }
  const sorted = [...rungs].sort((a, b) => b.resolution_m - a.resolution_m)
  const coarse = sorted[0]
  const fine = sorted[sorted.length - 1]
  return compare(coarse, fine, 'sunset') ?? compare(coarse, fine, 'earthset') ?? { kind: 'none' }
}

/** True when a measured band is a single value (every rung agrees to the shown precision). */
export function isPoint(range: { min: number; max: number }, precision: number): boolean {
  return Math.abs(range.max - range.min) < precision
}
