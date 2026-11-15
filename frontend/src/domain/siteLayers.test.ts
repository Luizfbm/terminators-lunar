import { describe, expect, it } from 'vitest'
import { initialLayers, layerOf, siteShown, type Layers } from './siteLayers'

const artemis = { id: 'CR01', source: 'wueller2026' }
const apollo = { id: 'APOLLO11', source: 'apollo' }
const isro = { id: 'CH3', source: 'isro' }
const clps = { id: 'BG1', source: 'clps' }
const lroc = { id: 'SURVEYOR7', source: 'lroc2016' }
const typed = { id: 'custom:-85,10', source: 'custom' }

const only = (layers: Partial<Layers>): Layers => ({ sites: false, missions: false, ...layers })

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

describe('which Sites are shown', () => {
  it('starts with the Artemis Sites and the missions both shown, so the four landing points of today stay on the globe', () => {
    expect(initialLayers()).toEqual({ sites: true, missions: true })
    expect(siteShown(artemis, initialLayers(), null)).toBe(true)
    for (const mission of [apollo, isro, clps, lroc]) expect(siteShown(mission, initialLayers(), null)).toBe(true)
  })

  it('shows the missions when Lunar Missions is pressed, with or without Sites', () => {
    for (const mission of [apollo, isro, clps, lroc]) {
      expect(siteShown(mission, only({ missions: true }), null)).toBe(true)
      expect(siteShown(mission, { sites: true, missions: true }, null)).toBe(true)
    }
    expect(siteShown(artemis, only({ missions: true }), null)).toBe(false)
  })

  it('hides everything but the chosen Site when both are released', () => {
    for (const site of [artemis, apollo, isro, clps, lroc]) {
      expect(siteShown(site, only({}), null)).toBe(false)
      expect(siteShown(site, only({}), site.id)).toBe(true)
    }
    expect(siteShown(artemis, only({}), apollo.id)).toBe(false)
  })

  it('always shows the chosen Site, whichever switch is released', () => {
    expect(siteShown(apollo, only({ sites: true }), 'APOLLO11')).toBe(true)
    expect(siteShown(artemis, only({ missions: true }), 'CR01')).toBe(true)
  })

  it('never hides a typed coordinate', () => {
    expect(siteShown(typed, only({}), null)).toBe(true)
  })

  it('counts the dots of a mixed list as the switches ask', () => {
    const all = [artemis, { id: 'CR02', source: 'wueller2026' }, { id: 'HW01', source: 'wueller2026' }, apollo, isro, lroc]
    const count = (layers: Layers, chosen: string | null) => all.filter((site) => siteShown(site, layers, chosen)).length
    expect(count(initialLayers(), 'CR01')).toBe(6)
    expect(count(only({ sites: true }), 'CR01')).toBe(3)
    expect(count(only({}), 'CR01')).toBe(1)
    expect(count(only({ missions: true }), 'CR01')).toBe(4)
    expect(count({ sites: true, missions: true }, 'CR01')).toBe(6)
    expect(count(only({}), 'APOLLO11')).toBe(1)
  })
})
