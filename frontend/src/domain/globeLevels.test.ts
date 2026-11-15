import { describe, expect, it } from 'vitest'
import { LEVEL_ITEMS, levelOfView, levelPressed, viewOfLevel } from './globeLevels'

describe('the two levels at the top of the globe menu', () => {
  it('are these two buttons, in this order, in English', () => {
    expect(LEVEL_ITEMS.map((item) => item.label)).toEqual(['Explore the Moon', 'South Pole in detail'])
  })

  it('have no third level', () => {
    expect(LEVEL_ITEMS).toHaveLength(2)
  })

  it('follow the view: orbit is Explore the Moon, the map is South Pole in detail, the ground is neither', () => {
    expect(levelOfView('orbit')).toBe('explore')
    expect(levelOfView('map')).toBe('south_pole')
    expect(levelOfView('ground')).toBeNull()
  })

  it('stand for the view they are named after', () => {
    expect(viewOfLevel('explore')).toBe('orbit')
    expect(viewOfLevel('south_pole')).toBe('map')
    for (const item of LEVEL_ITEMS) expect(levelOfView(viewOfLevel(item.id))).toBe(item.id)
  })

  it('ask for the view of the level clicked', () => {
    expect(levelPressed('explore', 'south_pole')).toBe('map')
    expect(levelPressed('south_pole', 'explore')).toBe('orbit')
  })

  it('press exactly one of the two in orbit and on the map, and none on the ground', () => {
    const pressedIn = (view: 'orbit' | 'map' | 'ground') => LEVEL_ITEMS.filter((item) => levelOfView(view) === item.id).length
    expect(pressedIn('orbit')).toBe(1)
    expect(pressedIn('map')).toBe(1)
    expect(pressedIn('ground')).toBe(0)
  })

  it('ask for nothing when the level clicked is already pressed: it is not released', () => {
    expect(levelPressed('explore', 'explore')).toBeNull()
    expect(levelPressed('south_pole', 'south_pole')).toBeNull()
  })

  it('from the ground, either one takes you to its view', () => {
    expect(levelPressed(levelOfView('ground'), 'explore')).toBe('orbit')
    expect(levelPressed(levelOfView('ground'), 'south_pole')).toBe('map')
  })
})
