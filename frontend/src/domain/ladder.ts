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

export interface RungDem {
  product: string
  resolution_m: number
}

/** What the rung's Horizon mask was built from, as the answer names it. */
export interface DemRung {
  dems: readonly RungDem[]
}

/** The one DEM every rung of a ladder was computed on. */
export interface SharedDem {
  product: string
  resolution_m: number
}

const demKey = (rung: DemRung) =>
  [...rung.dems]
    .map((dem) => `${dem.product}@${dem.resolution_m}`)
    .sort()
    .join('|')

/**
 * The DEM the rungs share when all of them use exactly the same one, or null when they differ. At
 * a global point the rungs are asked for 20, 80 and 240 m, but the engine has only LDEM_128 there
 * (236.9 m), so all three answer from the same pixels and the labels would claim a detail the
 * data does not have. With several DEMs behind every rung, the finest one names them.
 */
export function sharedDem(rungs: readonly DemRung[]): SharedDem | null {
  if (rungs.length < 2) return null
  const first = demKey(rungs[0])
  if (first === '' || rungs.some((rung) => demKey(rung) !== first)) return null
  const finest = rungs[0].dems.reduce((a, b) => (b.resolution_m < a.resolution_m ? b : a))
  return { product: finest.product, resolution_m: finest.resolution_m }
}
