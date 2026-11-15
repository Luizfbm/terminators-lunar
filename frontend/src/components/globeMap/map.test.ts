import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toVector } from '../../domain/sky'
import { DOT_RADIUS, hoverName, layoutMap, mapPlaces, mapStep, occupied, placeLabels, pointOnMap, REGION_RADIUS, regionHeight, RING_RADIUS, spreadMarkers, type Box, type MapSite, type Point } from './map'
import { readoutText } from './readout'
import { STRINGS } from './strings'

// the requirement: seen from the pole the map shows one marker per Region, a click flies into it and
// its Sites can each be asked about, "all regions" and Esc fly back out, and hover shows the name.
// The catalogue the backend serves is read at run time, so the test sees the real 134 Sites.

function csv(path: string): Record<string, string>[] {
  const [head, ...rows] = readFileSync(new URL(path, import.meta.url), 'utf8').trim().split('\n')
  const columns = head!.split(',')
  return rows.map((row) => {
    // The only quoted field is the citation, which holds commas.
    const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((cell) => cell.replace(/,$/, '').replace(/^"|"$/g, ''))
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']))
  })
}

const SITES: MapSite[] = csv('../../../../backend/app/data/sites.csv').map((row) => ({
  id: row.id!,
  name: row.name!,
  latitude_deg: Number(row.latitude_deg),
  longitude_deg: Number(row.longitude_deg),
  region_id: row.region_id || null,
}))
const REGIONS = csv('../../../../backend/app/data/regions.csv').map((row) => ({ id: row.id!, name: row.name!, count: Number(row.site_count) }))

/** The map seen from straight above the pole, 0° of longitude up, as the camera draws it. */
function polarScreen(width: number, height: number) {
  const pixelsPerDegree = (Math.min(width, height) / 2) * 0.9 / 10
  return (site: { latitude_deg: number; longitude_deg: number }): Point => {
    const fromPole = 90 + site.latitude_deg
    const lon = (site.longitude_deg * Math.PI) / 180
    // 90° E is on the right of the map seen from above the south pole.
    return { x: width / 2 + Math.sin(lon) * fromPole * pixelsPerDegree, y: height / 2 - Math.cos(lon) * fromPole * pixelsPerDegree }
  }
}

describe('the Regions on the polar map', () => {
  const { regions, loose } = mapPlaces(SITES, REGIONS)

  it('is one marker per Region, with how many Sites it holds, in the order /regions gives', () => {
    expect(regions.map((region) => region.id)).toEqual(REGIONS.map((region) => region.id))
    for (const region of regions) {
      expect(region.sites.length, region.id).toBe(REGIONS.find((entry) => entry.id === region.id)!.count)
      expect(region.name).toBe(REGIONS.find((entry) => entry.id === region.id)!.name)
    }
    expect(regions.reduce((total, region) => total + region.sites.length, 0)).toBe(130)
  })

  it('leaves the landers away from the pole off the map, and keeps a polar Site with no Region on its own', () => {
    expect(loose.map((site) => site.id)).toEqual(SITES.filter((site) => site.region_id === null && site.latitude_deg <= -80).map((site) => site.id))
    expect(loose.length).toBeGreaterThan(0)
    expect(loose.every((site) => site.latitude_deg <= -80)).toBe(true)
  })

  it('puts each marker in the middle of its Sites, and knows how far they reach from it', () => {
    for (const region of regions) {
      const lats = region.sites.map((site) => site.latitude_deg)
      expect(region.centre.latitude_deg, region.id).toBeGreaterThanOrEqual(Math.min(...lats) - 0.5)
      expect(region.centre.latitude_deg, region.id).toBeLessThanOrEqual(Math.max(...lats) + 0.5)
      // Every Site is within the spread of the middle, measured as an angle on the sphere.
      const middle = toVector(region.centre.latitude_deg, region.centre.longitude_deg)
      for (const site of region.sites) {
        const v = toVector(site.latitude_deg, site.longitude_deg)
        const angle = (Math.acos(Math.min(1, middle[0] * v[0] + middle[1] * v[1] + middle[2] * v[2])) * 180) / Math.PI
        expect(angle, site.id).toBeLessThanOrEqual(region.spreadDeg + 1e-9)
      }
      expect(region.spreadDeg, region.id).toBeLessThan(3)
    }
  })

  it('keeps the code of a Region that /regions does not know yet, after the known ones', () => {
    const { regions: named } = mapPlaces(
      [
        { id: 'X1', name: 'X1', latitude_deg: -88, longitude_deg: 10, region_id: 'NEW' },
        { id: 'H1', name: 'Haworth H1', latitude_deg: -87, longitude_deg: -20, region_id: 'HW' },
      ],
      [{ id: 'HW', name: 'Haworth' }],
    )
    expect(named.map((region) => [region.id, region.name])).toEqual([
      ['HW', 'Haworth'],
      ['NEW', 'NEW'],
    ])
  })

  it.each([
    [1366, 620],
    [1280, 560],
    [390, 330],
  ])('shows no pile of markers from the pole on a %i × %i stage', (width, height) => {
    const screen = polarScreen(width, height)
    const homes = regions.map((region) => screen(region.centre))
    const at = spreadMarkers(homes, {}, { gap: 25, radius: 11, maxShift: 22 })
    // Before: some Regions sit on top of each other (Mons Mouton and Nobile Rim 1 are 15 px apart at 1366).
    let crowded = 0
    for (let i = 0; i < homes.length; i += 1) {
      for (let j = i + 1; j < homes.length; j += 1) {
        if (Math.hypot(homes[i]!.x - homes[j]!.x, homes[i]!.y - homes[j]!.y) < 22) crowded += 1
      }
    }
    expect(crowded).toBeGreaterThan(0)
    // After: no two markers (22 px across) overlap, and none has wandered far from its Region.
    for (let i = 0; i < at.length; i += 1) {
      expect(Math.hypot(at[i]!.x - homes[i]!.x, at[i]!.y - homes[i]!.y)).toBeLessThanOrEqual(22 + 1e-9)
      for (let j = i + 1; j < at.length; j += 1) {
        expect(Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y), `${regions[i]!.id} and ${regions[j]!.id}`).toBeGreaterThanOrEqual(22)
      }
    }
  })

  it('draws the same markers from the same picture, so a still map never shivers', () => {
    const screen = polarScreen(1366, 620)
    const homes = regions.map((region) => screen(region.centre))
    const ring = { points: [{ x: 683, y: 310, gap: 26 }] }
    expect(spreadMarkers(homes, ring, { gap: 25, radius: 11, maxShift: 22 })).toEqual(spreadMarkers(homes, ring, { gap: 25, radius: 11, maxShift: 22 }))
  })

  it('keeps the markers off the ring on the chosen Site', () => {
    const ring = { x: 100, y: 100 }
    const [moved] = spreadMarkers([{ x: 104, y: 100 }], { points: [{ ...ring, gap: 25 }] }, { gap: 25, radius: 11, maxShift: 22 })
    expect(Math.hypot(moved!.x - ring.x, moved!.y - ring.y)).toBeGreaterThanOrEqual(25 - 1e-9)
  })
})

describe('the names beside the markers', () => {
  const bounds = { left: 0, top: 0, right: 400, bottom: 300 }

  it('go on the right when there is room, and on the left against the right edge', () => {
    const [right, left] = placeLabels(
      [
        { x: 50, y: 100, width: 80, height: 18 },
        { x: 380, y: 200, width: 80, height: 18 },
      ],
      11,
      bounds,
      [],
    )
    expect(right?.side).toBe('right')
    expect(left?.side).toBe('left')
  })

  it('never cover each other, the other markers or the name of the chosen Site, and never leave the stage', () => {
    const screen = polarScreen(1366, 620)
    const { regions } = mapPlaces(SITES, REGIONS)
    const at = spreadMarkers(regions.map((region) => screen(region.centre)), {}, { gap: 25, radius: 11, maxShift: 22 })
    const pin = { left: 690, top: 300, right: 900, bottom: 318 }
    const markers = at.map((point, index) => ({ ...point, width: regions[index]!.name.length * 7, height: 18 }))
    const stage = { left: 4, top: 44, right: 1362, bottom: 564 }
    const places = placeLabels(markers, 11, stage, [pin])
    const boxes = places.flatMap((place, index) =>
      place ? [{ left: at[index]!.x + place.x, top: at[index]!.y + place.y, right: at[index]!.x + place.x + markers[index]!.width, bottom: at[index]!.y + place.y + 18 }] : [],
    )
    // Most names find a place on a laptop screen; the rest show on hover and focus.
    expect(boxes.length).toBeGreaterThanOrEqual(regions.length - 4)
    const overlap = (a: typeof pin, b: typeof pin) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    for (const [index, box] of boxes.entries()) {
      expect(box.left).toBeGreaterThanOrEqual(stage.left)
      expect(box.right).toBeLessThanOrEqual(stage.right)
      expect(box.top).toBeGreaterThanOrEqual(stage.top)
      expect(box.bottom).toBeLessThanOrEqual(stage.bottom)
      expect(overlap(box, pin)).toBe(false)
      for (const other of boxes.slice(index + 1)) expect(overlap(box, other)).toBe(false)
      for (const point of at) expect(overlap(box, { left: point.x - 11, top: point.y - 11, right: point.x + 11, bottom: point.y + 11 })).toBe(false)
    }
  })

  it('wait for the hover when there is no room anywhere', () => {
    const crowd = [{ x: 200, y: 150, width: 380, height: 18 }]
    expect(placeLabels(crowd, 11, { left: 0, top: 0, right: 400, bottom: 300 }, [{ left: 0, top: 0, right: 400, bottom: 300 }])).toEqual([null])
  })
})

describe('a click, a key and a hover on the map', () => {
  const pole = { region: null }

  it('a click on a Region flies into it', () => {
    expect(mapStep(pole, { type: 'region', id: 'CR' }, '001')).toEqual({ view: { region: 'CR' }, ask: null })
  })

  it('a click on a Site asks about it straight away and stays in the Region', () => {
    expect(mapStep({ region: 'CR' }, { type: 'site', id: 'CR02' }, '001')).toEqual({ view: { region: 'CR' }, ask: 'CR02' })
  })

  it('a click on the Site already chosen asks nothing again', () => {
    expect(mapStep({ region: 'CR' }, { type: 'site', id: '001' }, '001').ask).toBeNull()
  })

  it('"all regions" and Esc fly back out to the pole', () => {
    expect(mapStep({ region: 'CR' }, { type: 'back' }, '001').view).toEqual(pole)
    expect(mapStep({ region: 'CR' }, { type: 'key', key: 'Escape' }, '001').view).toEqual(pole)
  })

  it('another key leaves the map where it is', () => {
    expect(mapStep({ region: 'CR' }, { type: 'key', key: 'Enter' }, '001').view).toEqual({ region: 'CR' })
  })

  it('the hover shows the name only, with no number', () => {
    const { regions } = mapPlaces(SITES, REGIONS)
    const ridge = regions.find((region) => region.id === 'CR')!
    expect(hoverName(ridge)).toBe('Connecting Ridge')
    expect(hoverName(ridge.sites[0]!)).toBe(ridge.sites[0]!.name)
    for (const region of regions) expect(hoverName(region)).not.toContain(String(region.sites.length))
  })
})

describe('the flight into a Region', () => {
  it('stops lower over a small Region than over a wide one, and higher on a narrow stage', () => {
    expect(regionHeight(0.3, 1.6)).toBeLessThan(regionHeight(1.2, 1.6))
    expect(regionHeight(1.2, 0.5)).toBeGreaterThan(regionHeight(1.2, 1.6))
  })

  it('leaves the Sites of the Region inside the picture', () => {
    for (const aspect of [0.46, 1, 2.2]) {
      const spread = 1.2
      const height = regionHeight(spread, aspect)
      // The Site farthest from the middle, seen from straight above, against the half field of view.
      const seenDeg = (Math.atan(((spread * Math.PI) / 180) / height) * 180) / Math.PI
      expect(seenDeg).toBeLessThan(16 * Math.min(1, aspect))
    }
  })

  it('never goes below the lowest the orbit view lets the camera go', () => {
    expect(regionHeight(0, 2)).toBeGreaterThanOrEqual(0.04)
  })
})

describe('the readout under the pointer', () => {
  it('says where the point is and that a double click asks about it', () => {
    const point = { latitude_deg: -89.4512, longitude_deg: -137.3 }
    expect(readoutText(point, 'en', false)).toBe('89.45° S, 137.30° W · double-click to ask about this point')
    expect(readoutText(point, 'pt', false)).toBe('89,45° S, 137,30° O · dê dois cliques para consultar este ponto')
    expect(readoutText({ latitude_deg: -85, longitude_deg: 31.85 }, 'en', true)).toBe('85.00° S, 31.85° E · double-tap to ask about this point')
  })

  it('shows nothing north of 80° S, where the map has no ground to ask about', () => {
    expect(pointOnMap(toVector(-79.9, 10))).toBeNull()
    expect(pointOnMap(null)).toBeNull()
    expect(pointOnMap(toVector(-85, 10))?.latitude_deg).toBeCloseTo(-85, 6)
  })
})

describe('the words of the map', () => {
  it('have the same placeholders in both languages', () => {
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(holes(STRINGS.pt[key]), key).toEqual(holes(STRINGS.en[key]))
    }
  })

  it('use the Glossary terms: Site and Region, Local and região', () => {
    expect(STRINGS.en.region).toContain('Sites')
    expect(STRINGS.pt.region).toContain('Locais')
    expect(STRINGS.en.allRegions).toBe('All regions')
    expect(STRINGS.pt.allRegions).toBe('Todas as regiões')
  })
})

// Validation check: with the default Query on the map, the markers "9",
// "6" and "8" sat on the name "Connecting Ridge (NASA site 001)" at 1366×768, and four markers
// covered it on a 390 px phone. The markers kept off the ring but not off the name beside it.
describe('the name of the chosen Site on the map', () => {
  const { regions, loose } = mapPlaces(SITES, REGIONS)

  /** The camera exactly as Globe.tsx places it: looking at the Moon's centre, the 0° meridian up. */
  function camera(width: number, height: number, region: (typeof regions)[number] | null) {
    const aspect = width / height
    const tan = Math.tan((16 * Math.PI) / 180)
    const where = region
      ? toVector(region.centre.latitude_deg, region.centre.longitude_deg).map((v) => v * (1 + regionHeight(region.spreadDeg, aspect)))
      : toVector(-89.9, 0).map((v) => v * (0.99 + 0.2 / (tan * Math.min(1, aspect))))
    const [cx, cy, cz] = where as [number, number, number]
    const back = [cx, cy, cz].map((v) => v / Math.hypot(cx, cy, cz)) as [number, number, number]
    const up0: [number, number, number] = [1, 0, 0]
    const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
    const rightRaw = cross(up0, back)
    const right = rightRaw.map((v) => v / Math.hypot(...rightRaw))
    const up = cross(back, right)
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
    return (place: { latitude_deg: number; longitude_deg: number }): Point => {
      const p = toVector(place.latitude_deg, place.longitude_deg).map((v) => v * 1.002)
      const rel = [p[0]! - cx, p[1]! - cy, p[2]! - cz]
      const depth = -dot(rel, back)
      return {
        x: ((dot(rel, right) / (depth * tan * aspect) + 1) / 2) * width,
        y: ((1 - dot(rel, up) / (depth * tan)) / 2) * height,
      }
    }
  }

  // The stage at 1440×900, 1366×768 and 1280×720 (the answer column takes 30rem), and on phones.
  const STAGES = [
    [960, 700],
    [886, 560],
    [800, 520],
    [390, 420],
    [390, 340],
    [360, 300],
  ] as const
  const textWidth = (text: string) => text.length * 7.2

  function layoutFor(chosen: MapSite, width: number, height: number, flownInto: (typeof regions)[number] | null) {
    const screen = camera(width, height, flownInto)
    const bounds = { left: 4, top: 44, right: width - 4, bottom: height - 56 }
    const onStage = (p: Point) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height
    const shown = regions.filter((region) => region !== flownInto).filter((region) => onStage(screen(region.centre)))
    const dots = [...(flownInto?.sites ?? []), ...loose].filter((site) => site.id !== chosen.id).map(screen).filter(onStage)
    const ring = screen(chosen)
    const layout = layoutMap({
      bounds,
      homes: shown.map((region) => screen(region.centre)),
      names: shown.map((region) => ({ width: textWidth(region.name), height: 18 })),
      dots,
      ring,
      pin: { width: textWidth(chosen.name), height: 20 },
    })
    return { layout, shown, dots, ring, bounds }
  }

  function clashes(chosen: MapSite, width: number, height: number, flownInto: (typeof regions)[number] | null): string[] {
    const { layout, shown, dots, ring, bounds } = layoutFor(chosen, width, height, flownInto)
    const found: string[] = []
    const pin = layout.pin!
    // Box against box, as the coordinator measured the screen: a marker is a 22 px square.
    const square = (p: Point, half: number): Box => ({ left: p.x - half, top: p.y - half, right: p.x + half, bottom: p.y + half })
    const covers = (a: Box, b: Box) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
    if (pin.left < bounds.left - 0.5 || pin.right > bounds.right + 0.5 || pin.top < bounds.top - 0.5 || pin.bottom > bounds.bottom + 0.5) found.push('the name leaves the stage')
    if (covers(square(ring, RING_RADIUS), pin)) found.push('the name covers the ring')
    layout.markers.forEach((marker, index) => {
      const name = shown[index]!.id
      const box = square(marker, REGION_RADIUS)
      if (covers(box, pin)) found.push(`${name} covers the name`)
      if (covers(box, square(ring, RING_RADIUS))) found.push(`${name} covers the ring`)
      for (const dot of dots) if (covers(box, square(dot, DOT_RADIUS))) found.push(`${name} covers a Site`)
      layout.markers.slice(index + 1).forEach((other, offset) => {
        if (covers(box, square(other, REGION_RADIUS))) found.push(`${name} covers ${shown[index + 1 + offset]!.id}`)
      })
    })
    return found
  }

  const byId = (id: string) => SITES.find((site) => site.id === id)!
  const ridge = byId('001')
  const mouton = byId('MMO05')

  it('was covered by the markers before: the name on its right, the markers kept only off the ring', () => {
    const [width, height] = [886, 560]
    const screen = camera(width, height, null)
    const ring = screen(ridge)
    const name = { left: ring.x + 12, top: ring.y - 10, right: ring.x + 12 + textWidth(ridge.name), bottom: ring.y + 10 }
    const old = spreadMarkers(
      regions.map((region) => screen(region.centre)),
      { points: [{ ...ring, gap: 25 }] },
      { gap: 25, radius: REGION_RADIUS, maxShift: 22 },
    )
    const covering = old.filter((m) => m.x + REGION_RADIUS > name.left && m.x - REGION_RADIUS < name.right && m.y + REGION_RADIUS > name.top && m.y - REGION_RADIUS < name.bottom)
    expect(covering.length).toBeGreaterThan(0)
  })

  it.each(STAGES)('is covered by no marker, and no marker covers another, from the pole on a %i × %i stage', (width, height) => {
    expect(clashes(ridge, width, height, null)).toEqual([])
    expect(clashes(mouton, width, height, null)).toEqual([])
  })

  it.each(STAGES)('stays clear in a crowded Region flown into, on a %i × %i stage', (width, height) => {
    for (const id of ['MMO', 'NR1', 'MMP', 'CR']) {
      const region = regions.find((entry) => entry.id === id)!
      const chosen = id === 'CR' ? ridge : region.sites[0]!
      expect(clashes(chosen, width, height, region), id).toEqual([])
    }
  })

  it('stays clear whichever polar Site is chosen, at 1366×768 and on a phone', () => {
    const found = SITES.filter((site) => site.latitude_deg <= -80).flatMap((site) =>
      [[886, 560], [390, 420]].flatMap(([width, height]) => clashes(site, width!, height!, null).map((clash) => `${site.id} at ${width}: ${clash}`)),
    )
    expect(found).toEqual([])
  })

  // regression: at 390×844 the grid label "90° L" sat under "Faustini Rim A" (28×17 px), because the
  // boxes the grid labels keep clear of held the markers and the chosen Site's name but no Region name.
  it.each(STAGES)('hands the grid labels every Region name it placed, on a %i × %i stage', (width, height) => {
    const { layout, shown, dots } = layoutFor(ridge, width, height, null)
    const sizes = shown.map((region) => ({ width: textWidth(region.name), height: 18 }))
    const clear = occupied(layout, sizes, dots)
    const named = layout.names.flatMap((place, index) => {
      if (!place) return []
      const marker = layout.markers[index]!
      return [{ id: shown[index]!.id, left: marker.x + place.x, top: marker.y + place.y, right: marker.x + place.x + sizes[index]!.width, bottom: marker.y + place.y + sizes[index]!.height }]
    })
    expect(named.length).toBeGreaterThan(0)
    for (const name of named) {
      // A grid label sitting in the middle of the name must find a box that covers it.
      const label = { x: (name.left + name.right) / 2, y: (name.top + name.bottom) / 2 }
      expect(clear.some((box) => box.left <= label.x && label.x <= box.right && box.top <= label.y && label.y <= box.bottom), name.id).toBe(true)
    }
  })

  it('wraps onto more lines, inside the stage, when one line is wider than a phone', () => {
    const long = SITES.find((site) => site.id === 'dGKM_K2023')!
    expect(textWidth(long.name)).toBeGreaterThan(382)
    const { layout, bounds } = layoutFor(long, 390, 420, null)
    expect(layout.pin!.wrap).not.toBeNull()
    expect(layout.pin!.right).toBeLessThanOrEqual(bounds.right)
    expect(layout.pin!.left).toBeGreaterThanOrEqual(bounds.left)
  })
})
