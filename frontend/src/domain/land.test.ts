import { describe, expect, it } from 'vitest'
import { landingPhase, landRef, MAP_CLICK_DELAY_MS, startLanding } from './land'
import { siteKey } from './query'

describe('what Land asks about', () => {
  // Regression (2026-11-15): "Land" only wrote the point to the console and said "Not wired yet".
  it('is the Curated Site the click snapped to, by its code', () => {
    expect(landRef({ lat: 0.674, lon: 23.473, siteId: 'APOLLO11' })).toBe('APOLLO11')
  })

  it('is the point itself, as a custom Site, when the click did not snap', () => {
    expect(landRef({ lat: 12.345, lon: -170.5 })).toEqual({ latitudeDeg: 12.345, longitudeDeg: -170.5 })
  })

  it('never sends the key of a typed coordinate as a code', () => {
    expect(landRef({ lat: -85, lon: 10, siteId: 'custom:-85,10' })).toEqual({ latitudeDeg: -85, longitudeDeg: 10 })
  })
})

describe('where a landing is', () => {
  const landing = startLanding({ lat: -81, lon: 10 }, null, 'CR01')
  const asked = siteKey({ latitudeDeg: -81, longitudeDeg: 10 })

  it('keys the landing as the Query keys the Site, and keeps the Site to go back to', () => {
    expect(landing.key).toBe(asked)
    expect(landing.previous).toBe('CR01')
    expect(startLanding({ lat: 0.674, lon: 23.473, siteId: 'APOLLO11' }, 'Apollo 11', null).key).toBe('APOLLO11')
  })

  it('waits while the answer for the point is on its way, and goes down only once it is ready', () => {
    expect(landingPhase(landing, asked, 'loading')).toBe('asking')
    expect(landingPhase(landing, asked, 'ready')).toBe('arrived')
  })

  it('stays on screen with its error when the answer fails, as the 422 outside the polar cap does today', () => {
    expect(landingPhase(landing, asked, 'error')).toBe('failed')
  })

  it('is dropped when another Site is asked for meanwhile, so it never takes the stage to the wrong ground', () => {
    for (const status of ['loading', 'error', 'ready'] as const) expect(landingPhase(landing, 'CR02', status)).toBe('stale')
  })

  it('is none without a landing', () => {
    expect(landingPhase(null, asked, 'ready')).toBe('none')
  })
})

describe('a click on the polar map', () => {
  it('waits for a second click about as long as a double click takes, and no longer than a third of a second and a bit', () => {
    expect(MAP_CLICK_DELAY_MS).toBeGreaterThanOrEqual(250)
    expect(MAP_CLICK_DELAY_MS).toBeLessThanOrEqual(400)
  })
})
