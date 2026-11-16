import type { View } from './query'

/**
 * Which presentation of the answer is on screen at each exploration level, decided in one place so no
 * component has to guess it from the view alone (issue #151: the answer card and the landing panel
 * stood over each other, and the safety circle came with the ground view at every level).
 *
 * Level 1 is "Explore the Moon": the orbit, and a landing made from it (with an optional chosen vehicle).
 * Level 2 is "South Pole in detail": the polar map, and a landing made from it with a vehicle.
 * Level 3 is the bounded exploration: its map and the surface view, whatever the view says.
 * Nothing here computes anything about the Sun or the Earth: it only says what is shown.
 */
export type ExplorationLevel = 1 | 2 | 3

export interface PresentationFacts {
  view: View
  /** The exploration view that led to a ground landing. Legacy links may omit it. */
  groundOrigin?: 'orbit' | 'map'
  /** A bounded Level 3 area has been confirmed and is the current landing. */
  confirmedSurface?: boolean
  /** The visitor is in Level 3: its map, its inspection or the surface of a chosen area. */
  level3: boolean
  /** A vehicle is chosen for the landing on screen at either ordinary level. */
  vehicle: boolean
  /** There is an answer to present. */
  answer: boolean
  /** `layout=classic`: the answer column presents the answer, so the panel adds nothing to it. */
  classic: boolean
}

export interface Presentation {
  /** Advanced controls only belong to a confirmed Level 3 ground landing. */
  advanced: boolean
  level: ExplorationLevel
  /**
   * The one panel that presents the answer, or none. 'site' holds only what exists without a vehicle: the
   * Site, the Window, the Sun and the Earth, the outages and the Countdowns. 'vehicle' is Larissa's landing
   * panel of Level 2, with the energy periods of the vehicle. There is never more than one.
   */
  panel: 'none' | 'site' | 'vehicle'
  /** The vehicle's own fields (its battery on the time strip, its energy periods) may show. */
  vehicleFields: boolean
  /** The safety circle, its seal, its balloons and the notes about hazard percentages: Level 3 only. */
  hazard: boolean
}

export function explorationLevel({ view, level3, vehicle, groundOrigin }: Pick<PresentationFacts, 'view' | 'level3' | 'vehicle' | 'groundOrigin'>): ExplorationLevel {
  if (level3) return 3
  if (view === 'orbit') return 1
  if (view === 'map') return 2
  if (groundOrigin) return groundOrigin === 'map' ? 2 : 1
  return vehicle ? 2 : 1
}

export function presentationOf(facts: PresentationFacts): Presentation {
  const level = explorationLevel(facts)
  const vehicleFields = level !== 3 && facts.view === 'ground' && facts.vehicle
  let panel: Presentation['panel'] = 'none'
  if (facts.answer && level !== 3) {
    if (vehicleFields) panel = 'vehicle'
    else if (!facts.classic) panel = 'site'
  }
  return { level, panel, vehicleFields, hazard: level === 3, advanced: level === 3 && facts.view === 'ground' && facts.confirmedSurface === true && facts.answer }
}
