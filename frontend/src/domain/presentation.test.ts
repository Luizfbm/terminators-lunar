import { describe, expect, it } from 'vitest'
import { explorationLevel, presentationOf, type PresentationFacts } from './presentation'
import type { View } from './query'

const VIEWS: View[] = ['orbit', 'map', 'ground']

const facts = (over: Partial<PresentationFacts> = {}): PresentationFacts => ({
  view: 'orbit',
  level3: false,
  vehicle: false,
  answer: true,
  classic: false,
  ...over,
})

describe('the level the visitor is in', () => {
  it('is 1 from orbit, 2 on the polar map, and the vehicle decides on the ground', () => {
    expect(explorationLevel(facts({ view: 'orbit' }))).toBe(1)
    expect(explorationLevel(facts({ view: 'map' }))).toBe(2)
    expect(explorationLevel(facts({ view: 'ground', vehicle: false }))).toBe(1)
    expect(explorationLevel(facts({ view: 'ground', vehicle: true }))).toBe(2)
  })

  it('is 3 whenever Level 3 is on, in any view and with or without a vehicle', () => {
    for (const view of VIEWS) {
      for (const vehicle of [false, true]) expect(explorationLevel(facts({ view, vehicle, level3: true }))).toBe(3)
    }
  })

  it('does not take a vehicle left over from an earlier landing for Level 2 on the orbit', () => {
    expect(explorationLevel(facts({ view: 'orbit', vehicle: true }))).toBe(1)
  })
})

describe('the one panel that presents the answer', () => {
  it('is the panel without vehicle fields at Level 1, from orbit and on the ground', () => {
    expect(presentationOf(facts({ view: 'orbit' })).panel).toBe('site')
    expect(presentationOf(facts({ view: 'ground' })).panel).toBe('site')
  })

  it('is the landing panel of Level 2 on the ground with a vehicle, and only there', () => {
    expect(presentationOf(facts({ view: 'ground', vehicle: true })).panel).toBe('vehicle')
    // Back on the polar map or the orbit, the vehicle of the landing left behind is not shown as a field of the Site.
    expect(presentationOf(facts({ view: 'map', vehicle: true })).panel).toBe('site')
    expect(presentationOf(facts({ view: 'orbit', vehicle: true })).panel).toBe('site')
  })

  it('never shows vehicle fields at Level 1, nor a vehicle that is not on the ground', () => {
    for (const view of VIEWS) {
      const level1 = presentationOf(facts({ view, vehicle: false }))
      expect(level1.vehicleFields).toBe(false)
      expect(level1.panel).not.toBe('vehicle')
    }
    expect(presentationOf(facts({ view: 'map', vehicle: true })).vehicleFields).toBe(false)
  })

  it('is none at Level 3, none without an answer, and none in the classic layout before a landing', () => {
    for (const view of VIEWS) {
      expect(presentationOf(facts({ view, level3: true, vehicle: true })).panel).toBe('none')
      expect(presentationOf(facts({ view, level3: true, vehicle: true })).vehicleFields).toBe(false)
    }
    expect(presentationOf(facts({ answer: false })).panel).toBe('none')
    expect(presentationOf(facts({ view: 'orbit', classic: true })).panel).toBe('none')
    expect(presentationOf(facts({ view: 'ground', vehicle: true, classic: true })).panel).toBe('vehicle')
  })

  it('is one value, so two panels cannot be on screen together, along N1, N2, N3 and Back', () => {
    // The walk of the issue: orbit, polar map, landing with a vehicle, Level 3, Back to the map, Back to orbit.
    const walk: Partial<PresentationFacts>[] = [
      { view: 'orbit' },
      { view: 'map' },
      { view: 'ground', vehicle: true },
      { view: 'map', vehicle: true },
      { view: 'map', vehicle: true, level3: true },
      { view: 'ground', vehicle: true, level3: true },
      { view: 'map', vehicle: true },
      { view: 'orbit', vehicle: true },
    ]
    expect(walk.map((step) => presentationOf(facts(step)).panel)).toEqual(['site', 'site', 'vehicle', 'site', 'none', 'none', 'site', 'site'])
  })
})

describe('the hazard elements', () => {
  it('belong to Level 3 and nothing else, whatever the view and the vehicle', () => {
    for (const view of VIEWS) {
      for (const vehicle of [false, true]) {
        expect(presentationOf(facts({ view, vehicle })).hazard, `${view} vehicle=${vehicle}`).toBe(false)
        expect(presentationOf(facts({ view, vehicle, level3: true })).hazard, `${view} vehicle=${vehicle} level 3`).toBe(true)
      }
    }
  })

  it('stay off on the ground of a landing at Levels 1 and 2, with a catalogue Site or not (the VIPER and 7.35° S cases)', () => {
    expect(presentationOf(facts({ view: 'ground', vehicle: false })).hazard).toBe(false)
    expect(presentationOf(facts({ view: 'ground', vehicle: true })).hazard).toBe(false)
  })

  it('do not depend on whether there is an answer', () => {
    expect(presentationOf(facts({ answer: false, level3: true })).hazard).toBe(true)
    expect(presentationOf(facts({ answer: false })).hazard).toBe(false)
  })
})


describe('confirmed Level 3 controls and the shared rover picker', () => {
  it('keeps an N1 rover landing at level 1 with the vehicle panel and no advanced UI', () => {
    const state = presentationOf(facts({ view: 'ground', groundOrigin: 'orbit', vehicle: true }))
    expect(state).toMatchObject({ level: 1, panel: 'vehicle', vehicleFields: true, advanced: false, hazard: false })
  })

  it('does not leak stale Level 3 confirmation into N1 or N2 after Back', () => {
    for (const groundOrigin of ['orbit', 'map'] as const) {
      const state = presentationOf(facts({ view: 'ground', groundOrigin, vehicle: true, confirmedSurface: true }))
      expect(state.advanced).toBe(false)
      expect(state.hazard).toBe(false)
    }
  })

  it('requires the N3 ground view, a confirmed area and an answer for advanced controls', () => {
    for (const view of VIEWS) for (const confirmedSurface of [false, true]) for (const answer of [false, true]) {
      const state = presentationOf(facts({ view, level3: true, confirmedSurface, answer }))
      expect(state.advanced).toBe(view === 'ground' && confirmedSurface && answer)
    }
  })
})
