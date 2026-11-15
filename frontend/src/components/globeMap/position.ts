// Moves the map's buttons and the name of the chosen Site to where they go on screen, once per
// frame (the requirement). Where things go is decided by `layoutMap`; this only reads sizes and writes styles.

import type { LatLon } from '../../domain/sky'
import { layoutMap, occupied, REGION_RADIUS, type Box, type MapRegion, type MapSite, type PinPlace, type Point } from './map'
import type { MarkerElements } from './MapLayer'

/** The caption sits along the top of the stage and the view buttons along the bottom. */
const TOP_CLEAR = 44
const BOTTOM_CLEAR = 56
const EDGE = 4

export interface Projected extends Point {
  facing: boolean
}

export interface MapFrame {
  width: number
  height: number
  project: (place: LatLon) => Projected
  regions: readonly MapRegion[]
  loose: readonly MapSite[]
  region: string | null
  chosen: { id: string; spot: Projected }
  /** The name of the chosen Site and its size on one line. */
  pin: { element: HTMLElement; width: number; height: number } | null
}

/** The size of each name, measured once per text (and again once the web font has arrived). */
export type NameSizes = Map<string, { width: number; height: number }>

const sizeOf = (name: HTMLElement, sizes: NameSizes) => {
  const key = `${document.fonts.status}:${name.textContent ?? ''}`
  let size = sizes.get(key)
  if (!size) {
    size = { width: name.offsetWidth, height: name.offsetHeight }
    if (size.width > 0) sizes.set(key, size)
  }
  return size
}

const inside = (spot: Projected, frame: MapFrame) =>
  spot.facing && spot.x >= 0 && spot.x <= frame.width && spot.y >= 0 && spot.y <= frame.height

const placePinElement = (element: HTMLElement, place: PinPlace) => {
  element.classList.add('globe__pin--placed')
  element.classList.remove('globe__pin--left')
  element.classList.toggle('globe__pin--wrap', place.wrap !== null)
  element.style.maxWidth = place.wrap === null ? '' : `${place.wrap}px`
  element.style.left = `${place.left}px`
  element.style.top = `${place.top}px`
}

/** Lays the map out and returns what the grid's labels must keep clear of. */
export function positionMap(frame: MapFrame, elements: MarkerElements, sizes: NameSizes): Box[] {
  const open = frame.regions.find((entry) => entry.id === frame.region) ?? null

  // The Sites of the Region flown into, and those with no Region: a dot each, the name on hover.
  const dots: Point[] = []
  for (const site of [...(open?.sites ?? []), ...frame.loose]) {
    const button = elements.get(`site:${site.id}`)
    if (!button) continue
    const spot = frame.project(site)
    button.hidden = !inside(spot, frame)
    if (button.hidden) continue
    button.style.left = `${spot.x}px`
    button.style.top = `${spot.y}px`
    // The chosen Site's dot is under its ring, which is in the layout already.
    if (site.id !== frame.chosen.id) dots.push(spot)
  }

  const shown: { button: HTMLElement; name: HTMLElement; home: Projected }[] = []
  for (const entry of frame.regions) {
    const button = elements.get(`region:${entry.id}`)
    if (!button) continue
    const home = frame.project(entry.centre)
    button.hidden = !inside(home, frame)
    const name = button.querySelector<HTMLElement>('.globe__name')
    if (!button.hidden && name) shown.push({ button, name, home })
  }

  // Only a ring inside the picture gets its name placed: down in another Region the chosen Site is
  // off the stage, and its name pulled inside the bounds would float there with nothing to name.
  const ring = inside(frame.chosen.spot, frame) ? frame.chosen.spot : null
  const input = {
    bounds: { left: EDGE, top: TOP_CLEAR, right: frame.width - EDGE, bottom: frame.height - BOTTOM_CLEAR },
    homes: shown.map(({ home }) => home),
    names: shown.map(({ name }) => sizeOf(name, sizes)),
    dots,
    ring,
    pin: frame.pin && ring ? { width: frame.pin.width, height: frame.pin.height } : null,
  }
  let layout = layoutMap(input)
  if (frame.pin && !layout.pin) frame.pin.element.hidden = true
  if (frame.pin && layout.pin) {
    placePinElement(frame.pin.element, layout.pin)
    // A wrapped name can take a line more than estimated: lay the markers out around its real box.
    const real = frame.pin.element.offsetHeight
    if (real > layout.pin.bottom - layout.pin.top + 0.5) {
      layout = layoutMap({ ...input, fixedPin: { ...layout.pin, bottom: layout.pin.top + real } })
    }
  }

  shown.forEach(({ button, name }, index) => {
    const point = layout.markers[index]!
    const place = layout.names[index] ?? null
    button.style.left = `${point.x}px`
    button.style.top = `${point.y}px`
    button.dataset.quiet = String(place === null)
    name.style.left = place ? `${REGION_RADIUS + place.x}px` : ''
    name.style.top = place ? `${REGION_RADIUS + place.y}px` : ''
  })

  return occupied(layout, input.names, dots)
}
