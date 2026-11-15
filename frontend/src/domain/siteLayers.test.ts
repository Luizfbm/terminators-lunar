import { describe, expect, it } from 'vitest'
import { MAP_EDGE_LATITUDE } from '../components/globeMap/map'
import { initialLayers, inScope, layerOf, layerShown, POLAR_SCOPE_EDGE_DEG, selectionShown, siteShown, toggledLayer, type Layers } from './siteLayers'

const artemis = { id: 'CR01', source: 'wueller2026', latitude_deg: -89.45 }
const apollo = { id: 'APOLLO11', source: 'apollo', latitude_deg: 0.67 }
const isro = { id: 'CH3', source: 'isro', latitude_deg: -69.37 }
const clps = { id: 'BG1', source: 'clps', latitude_deg: 18.56 }
const im2 = { id: 'IM2', source: 'clps', latitude_deg: -84.79 }
const lroc = { id: 'SURVEYOR7', source: 'lroc2016', latitude_deg: -40.98 }
const typed = { id: 'custom:-85,10', source: 'custom', latitude_deg: -85 }

const only = (layers: Partial<Layers>): Layers => ({ sites: false, missions: false, planets: true, ...layers })

describe('which switch governs a Site', () => {
  it('puts the Artemis Sites on Sites and every other curated source on Lunar Missions', () => {
    expect(layerOf('wueller2026')).toBe('sites')
    for (const source of ['apollo', 'clps', 'isro', 'lroc2016', 'barker2021']) expect(layerOf(source)).toBe('missions')
  })

  it('leaves a typed coordinate to no switch, and counts a Site without a source with the Artemis Sites', () => {
    expect(layerOf('custom')).toBeNull()
    expect(layerOf(undefined)).toBe('sites')
    expect(layerOf(null)).toBe('sites')
  })
})

describe('which Sites are shown on the whole Moon (level 1)', () => {
  it('starts with the Artemis Sites shown and the missions hidden', () => {
    expect(initialLayers()).toEqual({ sites: true, missions: false, planets: true })
    expect(siteShown(artemis, initialLayers())).toBe(true)
    for (const mission of [apollo, isro, clps, lroc, im2]) expect(siteShown(mission, initialLayers())).toBe(false)
  })

  it('shows the missions when Lunar Missions is pressed, with or without Sites', () => {
    for (const mission of [apollo, isro, clps, lroc, im2]) {
      expect(siteShown(mission, only({ missions: true }))).toBe(true)
      expect(siteShown(mission, { sites: true, missions: true, planets: true })).toBe(true)
    }
    expect(siteShown(artemis, only({ missions: true }))).toBe(false)
  })

  // Regression (2026-11-15): the chosen Site used to stay a dot with its switch released, so a released
  // layer still looked pressed. It keeps a ring of its own instead.
  it('hides every dot when both are released, the chosen Site too', () => {
    for (const site of [artemis, apollo, isro, clps, lroc]) expect(siteShown(site, only({}))).toBe(false)
    expect(layerShown(apollo, initialLayers())).toBe(false)
  })

  it('does not let the planets switch hide or show a Site', () => {
    for (const site of [artemis, apollo]) {
      expect(siteShown(site, { ...only({ sites: true, missions: true }), planets: false })).toBe(true)
      expect(siteShown(site, { ...only({}), planets: true })).toBe(false)
    }
  })

  it('never draws a typed coordinate as a dot of the lists', () => {
    expect(siteShown(typed, { sites: true, missions: true, planets: true })).toBe(false)
    expect(layerShown(typed, { sites: true, missions: true, planets: true })).toBe(false)
  })

  it('counts the dots of a mixed list as the switches ask', () => {
    const all = [artemis, { id: 'CR02', source: 'wueller2026', latitude_deg: -89.4 }, { id: 'HW01', source: 'wueller2026', latitude_deg: -87.2 }, apollo, isro, lroc, typed]
    const count = (layers: Layers) => all.filter((site) => siteShown(site, layers)).length
    expect(count(initialLayers())).toBe(3)
    expect(count(only({}))).toBe(0)
    expect(count(only({ missions: true }))).toBe(3)
    expect(count({ sites: true, missions: true, planets: true })).toBe(6)
  })
})

describe('the polar scope (level 2, South Pole in detail)', () => {
  it('reaches as far north as the edge of the polar map', () => {
    expect(POLAR_SCOPE_EDGE_DEG).toBe(MAP_EDGE_LATITUDE)
    expect(inScope({ latitude_deg: POLAR_SCOPE_EDGE_DEG }, 'polar')).toBe(true)
    expect(inScope({ latitude_deg: POLAR_SCOPE_EDGE_DEG + 0.01 }, 'polar')).toBe(false)
    expect(inScope({}, 'polar')).toBe(false)
    expect(inScope({}, 'global')).toBe(true)
  })

  it('keeps only the polar Sites of the layers that are pressed', () => {
    const both = { sites: true, missions: true, planets: true }
    expect(siteShown(artemis, both, 'polar')).toBe(true)
    expect(siteShown(im2, both, 'polar')).toBe(true)
    for (const away of [apollo, isro, clps, lroc]) expect(siteShown(away, both, 'polar')).toBe(false)
  })

  it('does not press Sites by itself: with Sites released the polar Sites stay hidden', () => {
    expect(siteShown(artemis, only({ missions: true }), 'polar')).toBe(false)
    expect(siteShown(im2, only({ missions: true }), 'polar')).toBe(true)
  })

  it('gives the whole set back on the whole Moon, as the switches say', () => {
    const layers = { sites: true, missions: true, planets: true }
    expect([artemis, apollo, isro, clps, im2, lroc].filter((site) => siteShown(site, layers, 'global'))).toHaveLength(6)
  })
})

describe('the ring of the chosen Site', () => {
  it('stays with the chosen Site on the whole Moon whatever the switches say', () => {
    for (const site of [artemis, apollo, typed]) expect(selectionShown(site, 'global')).toBe(true)
  })

  it('keeps to the polar scope: a chosen Site north of the edge has no ring on the map', () => {
    expect(selectionShown(artemis, 'polar')).toBe(true)
    expect(selectionShown(typed, 'polar')).toBe(true)
    expect(selectionShown(isro, 'polar')).toBe(false)
    expect(selectionShown(apollo, 'polar')).toBe(false)
  })
})

describe('pressing a switch', () => {
  it('turns that switch only, and does not change the state it is given', () => {
    const start = initialLayers()
    expect(toggledLayer(start, 'missions')).toEqual({ sites: true, missions: true, planets: true })
    expect(toggledLayer(start, 'sites')).toEqual({ sites: false, missions: false, planets: true })
    expect(toggledLayer(start, 'planets')).toEqual({ sites: true, missions: false, planets: false })
    expect(start).toEqual(initialLayers())
  })
})
