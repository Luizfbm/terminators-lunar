// What the polar map shows and how it answers a click, apart from the drawing (the requirement).
// Seen from the pole, each Region is one marker with its name and how many Sites it holds; a
// click on it flies the camera in and its Sites come apart. Everything here is plain arithmetic
// on numbers the answer already holds, so it is tested without a browser.

import { fromVector, toVector, type LatLon, type Vec3 } from '../../domain/sky'

/** The map reaches this far north, the limit of the polar terrain. */
export const MAP_EDGE_LATITUDE = -80

export interface MapSite extends LatLon {
  id: string
  name: string
  /** The Region the Site belongs to; a typed coordinate and a few landers have none. */
  region_id?: string | null
  /** Where the coordinate comes from: a mission's landing keeps its name in view on the map. */
  source?: string
}

export interface MapRegion {
  id: string
  name: string
  sites: MapSite[]
  /** The middle of its Sites, where its marker sits. */
  centre: LatLon
  /** The widest angle from the middle to one of its Sites, in degrees. */
  spreadDeg: number
}

export interface RegionName {
  id: string
  name: string
}

const RAD = Math.PI / 180

const angleDeg = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / RAD

/**
 * The Regions on the map, in the order `/regions` gives (a Region it does not know keeps its code
 * as its name, and goes after the known ones), and the Sites on the map with no Region. Only Sites
 * south of 80° S are on the map: the landers away from the pole are not.
 */
export function mapPlaces(
  sites: readonly MapSite[],
  names: readonly RegionName[],
): { regions: MapRegion[]; loose: MapSite[] } {
  const onMap = sites.filter((site) => site.latitude_deg <= MAP_EDGE_LATITUDE)
  const grouped = new Map<string, MapSite[]>()
  const loose: MapSite[] = []
  for (const site of onMap) {
    if (!site.region_id) {
      loose.push(site)
      continue
    }
    const list = grouped.get(site.region_id) ?? []
    list.push(site)
    grouped.set(site.region_id, list)
  }
  const order = new Map(names.map((region, index) => [region.id, index]))
  const ids = [...grouped.keys()].sort(
    (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
  )
  const regions = ids.map((id) => {
    const members = grouped.get(id) ?? []
    const vectors = members.map((site) => toVector(site.latitude_deg, site.longitude_deg))
    const sum = vectors.reduce<Vec3>((total, v) => [total[0] + v[0], total[1] + v[1], total[2] + v[2]], [0, 0, 0])
    const length = Math.hypot(...sum)
    const middle: Vec3 = [sum[0] / length, sum[1] / length, sum[2] / length]
    return {
      id,
      name: names.find((region) => region.id === id)?.name ?? id,
      sites: members,
      centre: fromVector(middle),
      spreadDeg: Math.max(0, ...vectors.map((v) => angleDeg(middle, v))),
    }
  })
  return { regions, loose }
}

/** Which Region the map is flown into; null is the whole pole. */
export type MapView = { region: string | null }

export type MapEvent =
  | { type: 'region'; id: string }
  | { type: 'site'; id: string }
  | { type: 'back' }
  | { type: 'key'; key: string }

/**
 * One step of the map: a Region flies in, "all regions" and Esc fly back out, and a Site is asked
 * about straight away, with no card in between. The Site already chosen is not asked again.
 */
export function mapStep(view: MapView, event: MapEvent, chosenId: string): { view: MapView; ask: string | null } {
  switch (event.type) {
    case 'region':
      return { view: { region: event.id }, ask: null }
    case 'site':
      return { view, ask: event.id === chosenId ? null : event.id }
    case 'back':
      return { view: { region: null }, ask: null }
    case 'key':
      return { view: event.key === 'Escape' ? { region: null } : view, ask: null }
  }
}

/**
 * How high above a Region the camera stops, in Moon radii: its Sites fill about half the shorter
 * side of the stage, and the camera never goes lower than the orbit view lets it.
 */
export function regionHeight(spreadDeg: number, aspect: number, halfFieldDeg = 16): number {
  const room = 0.5 * Math.tan(halfFieldDeg * RAD) * Math.min(1, aspect)
  return Math.max(0.04, (spreadDeg * RAD + 0.002) / room)
}

export interface Point {
  x: number
  y: number
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export type LabelSide = 'right' | 'left' | 'above' | 'below'

export interface LabelPlace {
  side: LabelSide
  /** Top left of the label, relative to the middle of its marker. */
  x: number
  y: number
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * Where each marker's name goes: beside it, on the right first, then the left, then above and
 * below, a little higher or lower when that is what it takes. A name that fits nowhere without
 * covering another, or leaving the `bounds`, is null: it shows on hover and focus only.
 */
export function placeLabels(
  markers: readonly (Point & { width: number; height: number })[],
  markerRadius: number,
  bounds: Box,
  obstacles: readonly Box[],
): (LabelPlace | null)[] {
  const gap = markerRadius + 4
  const taken: Box[] = [...obstacles, ...markers.map((m) => ({ left: m.x - markerRadius, top: m.y - markerRadius, right: m.x + markerRadius, bottom: m.y + markerRadius }))]
  return markers.map((marker) => {
    const { width, height } = marker
    const candidates: LabelPlace[] = [
      { side: 'right', x: gap, y: -height / 2 },
      { side: 'left', x: -gap - width, y: -height / 2 },
      { side: 'right', x: gap, y: -height * 1.1 },
      { side: 'right', x: gap, y: height * 0.1 },
      { side: 'left', x: -gap - width, y: -height * 1.1 },
      { side: 'left', x: -gap - width, y: height * 0.1 },
      { side: 'above', x: -width / 2, y: -gap - height },
      { side: 'below', x: -width / 2, y: gap },
    ]
    for (const place of candidates) {
      const box = { left: marker.x + place.x, top: marker.y + place.y, right: marker.x + place.x + width, bottom: marker.y + place.y + height }
      const inside = box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom
      if (inside && !taken.some((other) => overlaps(box, other))) {
        taken.push(box)
        return place
      }
    }
    return null
  })
}

/** Half the size of a Region marker, and how close the middles of two of them may come. */
export const REGION_RADIUS = 11
export const REGION_GAP = 2 * REGION_RADIUS + 3
/** How far a marker may leave its Region to make room; twice that when a name or the ring is in the way. */
export const REGION_MAX_SHIFT = 22
/** The ring on the chosen Site, and a Site's dot, as the map draws them. */
export const RING_RADIUS = 12
export const DOT_RADIUS = 5

export interface Obstacles {
  /** Round things a marker keeps `gap` away from: the ring on the chosen Site, the Site dots. */
  points?: readonly (Point & { gap: number })[]
  /** Boxes a marker keeps clear of: the name of the chosen Site. */
  boxes?: readonly Box[]
}

const within = (p: Point, b: Box) => p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom

/**
 * The nearest point outside every box: the ring and the name of the chosen Site touch, so leaving
 * one by its nearest side can land in the other. Same input, same output.
 */
function escape(point: Point, boxes: readonly Box[]): Point {
  if (!boxes.some((box) => within(point, box))) return point
  const xs = [point.x, ...boxes.flatMap((box) => [box.left - 0.01, box.right + 0.01])]
  const ys = [point.y, ...boxes.flatMap((box) => [box.top - 0.01, box.bottom + 0.01])]
  let best: Point | null = null
  let bestMove = Infinity
  for (const x of xs) {
    for (const y of ys) {
      const move = Math.hypot(x - point.x, y - point.y)
      if (move < bestMove && !boxes.some((box) => within({ x, y }, box))) {
        best = { x, y }
        bestMove = move
      }
    }
  }
  return best ?? point
}

/**
 * Markers closer than `gap` push each other apart, and out of the `obstacles`, by no more than
 * `maxShift` from where they belong; markers still in the way after that may go two, three and four times as far.
 * Same input, same output, so a still map never shivers.
 */
export function spreadMarkers(
  points: readonly Point[],
  obstacles: Obstacles,
  { gap, radius, maxShift }: { gap: number; radius: number; maxShift: number },
): Point[] {
  // Distances are measured box to box, as the screen draws a marker: a 22 px square around its middle.
  const at = points.map((point) => ({ ...point }))
  const clear = radius + 1
  const apart = (a: Point, b: Point, need: number, share: number) => {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const far = Math.max(Math.abs(dx), Math.abs(dy))
    if (far >= need) return
    const push = (need - far + 0.01) * share
    // Along the axis they are already furthest apart on; two on the same spot part sideways.
    if (Math.abs(dx) >= Math.abs(dy)) {
      const sign = dx > 0 || (dx === 0 && dy === 0) ? 1 : -1
      a.x += sign * push
      if (share < 1) b.x -= sign * push
    } else {
      const sign = dy > 0 ? 1 : -1
      a.y += sign * push
      if (share < 1) b.y -= sign * push
    }
  }
  const clamp = (reach: number) =>
    at.forEach((point, index) => {
      const home = points[index]!
      const dx = point.x - home.x
      const dy = point.y - home.y
      const shift = Math.hypot(dx, dy)
      if (shift > reach) {
        point.x = home.x + (dx / shift) * reach
        point.y = home.y + (dy / shift) * reach
      }
    })
  // Every obstacle as the box a marker's middle must stay out of.
  const blocked: Box[] = [
    ...(obstacles.points ?? []).map((p) => ({ left: p.x - p.gap, top: p.y - p.gap, right: p.x + p.gap, bottom: p.y + p.gap })),
    ...(obstacles.boxes ?? []).map((b) => ({ left: b.left - clear, top: b.top - clear, right: b.right + clear, bottom: b.bottom + clear })),
  ]
  for (let round = 0; round < 64; round += 1) {
    // Markers that are still in the way after a while may go further from their Region.
    clamp(maxShift * (1 + Math.floor(round / 16)))
    for (let i = 0; i < at.length; i += 1) {
      for (let j = i + 1; j < at.length; j += 1) apart(at[j]!, at[i]!, gap, 0.5)
    }
    // The ring, the dots and the name come last in every round, so they always win.
    for (const a of at) {
      const free = escape(a, blocked)
      a.x = free.x
      a.y = free.y
    }
  }
  // Last, one by one: each marker goes to the nearest free spot, clear of the obstacles and of
  // the markers already settled, so none is left on top of another.
  const settled: Box[] = []
  for (const a of at) {
    const free = escape(a, [...blocked, ...settled])
    a.x = free.x
    a.y = free.y
    settled.push({ left: a.x - gap, top: a.y - gap, right: a.x + gap, bottom: a.y + gap })
  }
  return at
}

export interface PinPlace extends Box {
  /** The width the name wraps at, or null when it stays on one line. */
  wrap: number | null
}

const area = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

const around = (point: Point, radius: number): Box => ({ left: point.x - radius, top: point.y - radius, right: point.x + radius, bottom: point.y + radius })

/**
 * Where the name of the chosen Site goes on the map: beside its ring, on the side where the fewest
 * markers and dots are, wrapped onto more lines when one line covers them all. It stays inside the
 * `bounds`; the markers it still touches make room for it afterwards.
 */
export function placePin(ring: Point, size: { width: number; height: number }, bounds: Box, markers: readonly Point[], dots: readonly Point[]): PinPlace {
  const gap = RING_RADIUS + 4
  const busy = [...markers.map((m) => around(m, REGION_RADIUS + 2)), ...dots.map((d) => around(d, DOT_RADIUS + 2))]
  // On one line when it fits the stage, then narrower and on more lines.
  const room = bounds.right - bounds.left
  const widths = [...new Set([size.width, 180, 130, 96].map((width) => Math.min(width, size.width, room)))]
  let best: { place: PinPlace; cost: number } | null = null
  for (const width of widths) {
    // A wrapped name breaks between words, so it may take a line more than its width says.
    const lines = width === size.width ? 1 : Math.ceil((size.width * 1.15) / width)
    const height = lines * size.height
    const wrap = width === size.width ? null : width
    const spots = [
      { x: ring.x + gap, y: ring.y - height / 2 },
      { x: ring.x - gap - width, y: ring.y - height / 2 },
      { x: ring.x - width / 2, y: ring.y - gap - height },
      { x: ring.x - width / 2, y: ring.y + gap },
      { x: ring.x + gap, y: ring.y - height - 2 },
      { x: ring.x + gap, y: ring.y + 2 },
      { x: ring.x - gap - width, y: ring.y - height - 2 },
      { x: ring.x - gap - width, y: ring.y + 2 },
    ]
    for (const spot of spots) {
      // Pushed back inside the stage where it runs over an edge, but never onto the ring.
      const left = Math.max(bounds.left, Math.min(spot.x, bounds.right - width))
      const top = Math.max(bounds.top, Math.min(spot.y, bounds.bottom - height))
      const place = { left, top, right: left + width, bottom: top + height, wrap }
      if (area(place, around(ring, RING_RADIUS)) > 0) continue
      // A wrapped name is a little harder to read: it wins only when it covers less.
      const cost = busy.reduce((total, box) => total + area(place, box), 0) + (wrap === null ? 0 : 1)
      if (!best || cost < best.cost) best = { place, cost }
      if (cost === 0) return place
    }
  }
  if (best) return best.place
  const left = Math.max(bounds.left, Math.min(ring.x + gap, bounds.right - size.width))
  return { left, top: ring.y - size.height / 2, right: left + size.width, bottom: ring.y + size.height / 2, wrap: null }
}

export interface MapLayout {
  markers: Point[]
  names: (LabelPlace | null)[]
  pin: PinPlace | null
}

/**
 * The whole map at one frame: where the name of the chosen Site goes, where each Region marker
 * sits, and where each marker's name goes. No marker covers the ring, the name of the chosen Site,
 * a Site's dot or another marker; no name covers any of them either.
 */
export function layoutMap({
  bounds,
  homes,
  names,
  dots,
  ring,
  pin,
  fixedPin,
}: {
  bounds: Box
  /** Where each Region's marker belongs, on screen. */
  homes: readonly Point[]
  /** The size of each Region's name. */
  names: readonly { width: number; height: number }[]
  /** The Site dots on screen: those of the Region flown into, and those with no Region. */
  dots: readonly Point[]
  /** The ring on the chosen Site, when it is on screen. */
  ring: Point | null
  /** The size of the chosen Site's name on one line. */
  pin: { width: number; height: number } | null
  /** Where the name already is, as measured, instead of placing it again. */
  fixedPin?: PinPlace
}): MapLayout {
  const placed = fixedPin ?? (ring && pin ? placePin(ring, pin, bounds, homes, dots) : null)
  const markers = spreadMarkers(
    homes,
    {
      points: [
        ...(ring ? [{ ...ring, gap: RING_RADIUS + REGION_RADIUS + 3 }] : []),
        ...dots.map((dot) => ({ ...dot, gap: DOT_RADIUS + REGION_RADIUS + 3 })),
      ],
      boxes: placed ? [placed] : [],
    },
    { gap: REGION_GAP, radius: REGION_RADIUS, maxShift: REGION_MAX_SHIFT },
  )
  const taken = [...(placed ? [placed] : []), ...(ring ? [around(ring, RING_RADIUS)] : []), ...dots.map((dot) => around(dot, DOT_RADIUS))]
  const labels = placeLabels(
    markers.map((point, index) => ({ ...point, ...names[index]! })),
    REGION_RADIUS,
    bounds,
    taken,
  )
  return { markers, names: labels, pin: placed }
}

/**
 * Everything the map has put on screen, as boxes: the chosen Site's name, each marker, each Region
 * name beside its marker and each Site dot. A grid label inside one of them would be read as part
 * of it, so the grid's labels keep clear of all of them.
 */
export function occupied(layout: MapLayout, names: readonly { width: number; height: number }[], dots: readonly Point[]): Box[] {
  const placedNames = layout.names.flatMap((place, index) => {
    const marker = layout.markers[index]
    const size = names[index]
    if (!place || !marker || !size) return []
    const left = marker.x + place.x
    const top = marker.y + place.y
    return [{ left, top, right: left + size.width, bottom: top + size.height }]
  })
  return [
    ...(layout.pin ? [layout.pin] : []),
    ...layout.markers.map((point) => around(point, REGION_RADIUS)),
    ...placedNames,
    ...dots.map((dot) => around(dot, DOT_RADIUS)),
  ]
}

/**
 * The words a marker shows when the pointer is over it or it has the focus: the name only, no
 * number. A Region's name also stays beside it when there is room, with its count in the marker.
 */
export function hoverName(place: MapRegion | MapSite): string {
  return place.name
}

/** A point as the map's readout says it: degrees with two decimals and the hemisphere letters. */
export function coordinateParts(point: LatLon): { lat: number; ns: 'N' | 'S'; lon: number; ew: 'E' | 'W' } {
  const round = (value: number) => Math.round(Math.abs(value) * 100) / 100
  return {
    lat: round(point.latitude_deg),
    ns: point.latitude_deg < 0 ? 'S' : 'N',
    lon: round(point.longitude_deg),
    ew: point.longitude_deg < 0 ? 'W' : 'E',
  }
}

/** The point to show under the pointer, or null where the map has no ground to ask about. */
export function pointOnMap(hit: Vec3 | null): LatLon | null {
  if (!hit) return null
  const place = fromVector(hit)
  return place.latitude_deg > MAP_EDGE_LATITUDE ? null : place
}
