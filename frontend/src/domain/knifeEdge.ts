/**
 * Knife-edge Sites: when a small miss changes the answer. It reads the Landing scatter the "If the
 * lander misses" panel already fetched, the Query asked at the Site and at points around it, and says
 * whether the Sun or the Earth is much better or much worse a few hundred metres away.
 */

/** What the rule reads of one point: how far it is and the hours it has the Sun and the Earth. */
export interface KnifePoint {
  distance_m: number
  azimuth_deg: number
  metrics: { sunlit_hours: number; earth_visible_hours: number }
}

/** What the rule reads of the scatter: the Site first, then the points around it (as the contract orders them). */
export interface KnifeScatter {
  query: { duration_hours: number }
  points: KnifePoint[]
}

/**
 * Only points this close count. 250 m is the miss IM-2 Athena made, the reason this warning exists;
 * the scatter can also be asked at 500 m, and a flip that far out is a wide margin, not a knife edge.
 */
export const KNIFE_MAX_DISTANCE_M = 250

/**
 * The difference that counts, as a share of the Window: 10 %, about 3 days of a synodic month. Below
 * it, a point differs by hours, a Sunset that moves rather than a night that appears or vanishes,
 * and the Site is not what decides the mission. Above it the answer is a different one.
 */
export const KNIFE_MIN_SHARE = 0.1

/** And never less than an hour, so a Window of a day does not flag a difference of minutes. */
export const KNIFE_MIN_HOURS = 1

export type KnifeBody = 'sun' | 'earth'

export interface KnifeEdge {
  /** `loses`: the point has less of the body than the Site. `gains`: it has more, so the Site is the worse place. */
  kind: 'loses' | 'gains'
  body: KnifeBody
  point: KnifePoint
  /** Hours the point differs from the Site by: always positive. */
  hours: number
}

function hoursOf(point: KnifePoint, body: KnifeBody): number {
  return body === 'sun' ? point.metrics.sunlit_hours : point.metrics.earth_visible_hours
}

/** True when `found` should replace `best`: a loss beats a gain, then the larger change wins. */
function outranks(found: KnifeEdge, best: KnifeEdge | null): boolean {
  if (!best) return true
  if (found.kind !== best.kind) return found.kind === 'loses'
  return found.hours > best.hours
}

/**
 * The biggest flip within reach of a miss, or null for a stable Site. A loss comes before a gain,
 * because it is what puts a mission at risk; between two of the same kind the larger wins, and the
 * Sun comes before the Earth on a tie, since the Sun decides whether the lander lives.
 */
export function knifeEdge(scatter: KnifeScatter): KnifeEdge | null {
  const [site, ...around] = scatter.points
  if (!site) return null
  const threshold = Math.max(KNIFE_MIN_HOURS, KNIFE_MIN_SHARE * scatter.query.duration_hours)
  let best: KnifeEdge | null = null
  for (const body of ['sun', 'earth'] as const) {
    for (const point of around) {
      if (point.distance_m > KNIFE_MAX_DISTANCE_M) continue
      const change = hoursOf(point, body) - hoursOf(site, body)
      if (Math.abs(change) < threshold) continue
      const found: KnifeEdge = { kind: change < 0 ? 'loses' : 'gains', body, point, hours: Math.abs(change) }
      if (outranks(found, best)) best = found
    }
  }
  return best
}
