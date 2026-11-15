import { describe, expect, it } from 'vitest'
import { initialMenu, layersOf, MENU_ITEMS, menuItemsFor, releasedTurns, toggled } from './globeMenu'
import { initialLayers } from './siteLayers'

describe('the menu on the left of the globe', () => {
  it('has these six buttons, in this order, in English', () => {
    expect(MENU_ITEMS.map((item) => item.label)).toEqual(['Initial position', 'Dark side', 'Northern Hemisphere', 'Southern Hemisphere', 'Lunar Missions', 'Sites'])
  })

  it('starts with only Sites pressed', () => {
    expect(initialMenu()).toEqual({ initial: false, dark_side: false, north: false, south: false, missions: false, sites: true })
  })

  it('presses a button on a click and releases it on the next, and never touches the others', () => {
    const start = initialMenu()
    const pressed = toggled(start, 'dark_side')
    expect(pressed.dark_side).toBe(true)
    expect({ ...pressed, dark_side: false }).toEqual(start)
    expect(toggled(pressed, 'dark_side')).toEqual(start)
    expect(toggled(start, 'sites').sites).toBe(false)
    expect({ ...toggled(start, 'sites'), sites: true }).toEqual(start)
  })

  it('releases the other two buttons that turn the Moon when one of them is pressed', () => {
    const south = toggled(initialMenu(), 'south')
    expect(south).toEqual({ initial: false, dark_side: false, north: false, south: true, missions: false, sites: true })
    const north = toggled(south, 'north')
    expect(north).toEqual({ initial: false, dark_side: false, north: true, south: false, missions: false, sites: true })
    const dark = toggled(north, 'dark_side')
    expect(dark).toEqual({ initial: false, dark_side: true, north: false, south: false, missions: false, sites: true })
    // Releasing one presses nothing else.
    expect(toggled(dark, 'dark_side')).toEqual({ initial: false, dark_side: false, north: false, south: false, missions: false, sites: true })
  })

  it('has the Initial position in the same group: pressing it releases the others, and the others release it', () => {
    const initial = toggled(toggled(initialMenu(), 'south'), 'initial')
    expect(initial).toEqual({ initial: true, dark_side: false, north: false, south: false, missions: false, sites: true })
    expect(toggled(initial, 'north').initial).toBe(false)
  })

  it('leaves Missions and Sites alone when the Moon is turned', () => {
    const state = toggled(toggled(initialMenu(), 'missions'), 'south')
    expect(state.missions).toBe(true)
    expect(state.sites).toBe(true)
    expect(toggled(state, 'sites').south).toBe(true)
  })

  it('does not change the state it is given', () => {
    const start = initialMenu()
    toggled(start, 'north')
    expect(start).toEqual(initialMenu())
  })

  it('says what its two switches show, and starts as the layers start', () => {
    expect(layersOf(initialMenu())).toEqual(initialLayers())
    expect(layersOf(toggled(initialMenu(), 'missions'))).toEqual({ sites: true, missions: true })
    expect(layersOf(toggled(initialMenu(), 'sites'))).toEqual({ sites: false, missions: false })
    // Turning the Moon changes nothing about the dots.
    expect(layersOf(toggled(initialMenu(), 'north'))).toEqual(initialLayers())
  })

  it('releases the four buttons that turn the Moon and leaves the two switches as they are', () => {
    const state = toggled(toggled(initialMenu(), 'missions'), 'dark_side')
    expect(releasedTurns(state)).toEqual({ initial: false, dark_side: false, north: false, south: false, missions: true, sites: true })
    expect(state.dark_side).toBe(true)
  })

  it('has all six buttons in orbit', () => {
    expect(menuItemsFor('orbit')).toEqual(MENU_ITEMS)
  })

  // Regression (2026-11-15): on the polar map the menu had only the two levels, so Sites and Lunar
  // Missions could not be switched there.
  it('keeps the two switches on the polar map, and drops the four buttons that turn the Moon', () => {
    expect(menuItemsFor('map').map((item) => item.label)).toEqual(['Lunar Missions', 'Sites'])
  })
})
