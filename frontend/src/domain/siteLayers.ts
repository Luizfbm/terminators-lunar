import { MAP_EDGE_LATITUDE } from '../components/globeMap/map'

/** The switches of the globe's menu that show and hide what is drawn: the dots of the Sites and the planets of the sky. */
export interface Layers {
  /** The Artemis Sites of Wueller et al. 2026. */
  sites: boolean
  /** The landing sites of missions that flew (Apollo, CLPS, ISRO, LROC 2016). */
  missions: boolean
  /** The seven planets as points of light behind the Moon, and their names. */
  planets: boolean
}

/** Only the Artemis Sites start shown among the dots; the planets of the sky start shown, as they were before the menu. */
export const initialLayers = (): Layers => ({ sites: true, missions: false, planets: true })

/** The `source` the 130 Artemis Sites come from; every other curated source is a mission's landing. */
export const ARTEMIS_SOURCE = 'wueller2026'
/** The `source` of a typed coordinate: it is never a dot of the lists. */
export const CUSTOM_SOURCE = 'custom'

/**
 * Which part of the Moon the stage is about: the whole Moon (level 1, "Explore the Moon") or the south
 * polar cap down to the edge of the polar map (level 2, "South Pole in detail").
 */
export type Scope = 'global' | 'polar'

/** The polar scope reaches this far north: the edge of the polar map, not the limit of a custom Site. */
export const POLAR_SCOPE_EDGE_DEG = MAP_EDGE_LATITUDE

/** A Site as far as the layers are concerned. A Site without a source counts with the Artemis Sites. */
export interface LayerSite {
  id: string
  source?: string | null
  latitude_deg?: number
}

/** Which switch of the dots a source belongs to, or null for a source no switch governs (a typed coordinate). */
export function layerOf(source: string | null | undefined): 'sites' | 'missions' | null {
  if (source === CUSTOM_SOURCE) return null
  return source === undefined || source === null || source === ARTEMIS_SOURCE ? 'sites' : 'missions'
}

/** Whether the switch of a Site's layer is pressed. A typed coordinate belongs to no layer, so it is never a dot. */
export function layerShown(site: LayerSite, layers: Layers): boolean {
  const layer = layerOf(site.source)
  return layer !== null && layers[layer]
}

/** Whether a Site lies inside the part of the Moon the stage is about. A Site with no latitude is outside the cap. */
export function inScope(site: { latitude_deg?: number }, scope: Scope): boolean {
  if (scope === 'global') return true
  return site.latitude_deg !== undefined && site.latitude_deg <= POLAR_SCOPE_EDGE_DEG
}

/**
 * Whether a Site is drawn, labelled and can be landed on by snapping to it: its switch is pressed and it
 * lies in the scope of the level. The chosen Site is no exception: it has a ring of its own
 * (`selectionShown`), which is not a dot and does not make a released layer look pressed.
 */
export function siteShown(site: LayerSite, layers: Layers, scope: Scope = 'global'): boolean {
  return layerShown(site, layers) && inScope(site, scope)
}

/**
 * Whether the ring and the name of the chosen Site are shown. They stay with the chosen Site whatever the
 * switches say, but they keep to the scope: on the polar map a Site north of its edge has no ring.
 */
export function selectionShown(site: { latitude_deg?: number }, scope: Scope): boolean {
  return inScope(site, scope)
}

/** One switch pressed or released, the others left as they are. */
export function toggledLayer(layers: Layers, id: keyof Layers): Layers {
  return { ...layers, [id]: !layers[id] }
}
