/** The two switches of the globe's menu that show and hide the dots of the Sites. */
export interface Layers {
  /** The Artemis Sites of Wueller et al. 2026. */
  sites: boolean
  /** The landing sites of missions that flew (Apollo, CLPS, ISRO, LROC 2016). */
  missions: boolean
}

/** Only the Artemis Sites start shown. */
export const initialLayers = (): Layers => ({ sites: true, missions: false })

/** The `source` the 130 Artemis Sites come from; every other curated source is a mission's landing. */
export const ARTEMIS_SOURCE = 'wueller2026'
/** The `source` of a typed coordinate: it is never a dot of the lists. */
export const CUSTOM_SOURCE = 'custom'

/** A Site as far as the layers are concerned. A Site without a source counts with the Artemis Sites. */
export interface LayerSite {
  id: string
  source?: string | null
}

/** Which switch a source belongs to, or null for a source no switch governs (a typed coordinate). */
export function layerOf(source: string | null | undefined): keyof Layers | null {
  if (source === CUSTOM_SOURCE) return null
  return source === undefined || source === null || source === ARTEMIS_SOURCE ? 'sites' : 'missions'
}

/**
 * Whether a Site is drawn and can be picked. The Site that is chosen always is, with its switch released
 * too: the ring and the dot never leave the one the numbers are about.
 */
export function siteShown(site: LayerSite, layers: Layers, chosenId: string | null): boolean {
  if (site.id === chosenId) return true
  const layer = layerOf(site.source)
  return layer === null || layers[layer]
}
