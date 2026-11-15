import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toApiInstant } from '../../api/client'
import { HEIGHT_MAX_M } from '../../domain/query'
import { getRovers } from './api'
import {
  DEFAULT_DAYS,
  DEFAULT_YEAR,
  MISSION_DAYS,
  MISSION_YEARS,
  buildMission,
  cannotRecharge,
  darknessToleranceHours,
  defaultMission,
  describeRover,
  initialRover,
  isEstimated,
  missionFit,
  missionWindow,
  moonFirst,
  shortName,
  suggestedObserverHeight,
  windowEndMs,
  windowInCoverage,
} from './mission'
import type { Coverage, Rover, RoverList } from './types'

// The contract's own example: Eduardo's eight rovers, as GET /rovers answers.
const example = JSON.parse(readFileSync(new URL('../../../../contract/examples/rovers.example.json', import.meta.url), 'utf8')) as {
  value: RoverList
}
const ROVERS = example.value.rovers
const rover = (id: string): Rover => {
  const found = ROVERS.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no ${id} in the example`)
  return found
}

describe('the catalogue', () => {
  it('has the eight rovers, four for the Moon and four from Mars', () => {
    expect(ROVERS).toHaveLength(8)
    expect(ROVERS.filter((r) => r.body === 'moon')).toHaveLength(4)
    expect(ROVERS.filter((r) => r.body === 'mars')).toHaveLength(4)
  })

  it('puts the Moon rovers first and keeps the order inside each group', () => {
    const shuffled = [rover('curiosity'), rover('viper'), rover('mer'), rover('lrv'), rover('perseverance'), rover('mapp'), rover('sojourner'), rover('ltv')]
    expect(moonFirst(shuffled).map((r) => r.id)).toEqual(['viper', 'lrv', 'mapp', 'ltv', 'curiosity', 'mer', 'perseverance', 'sojourner'])
    expect(moonFirst(ROVERS).map((r) => r.body)).toEqual(['moon', 'moon', 'moon', 'moon', 'mars', 'mars', 'mars', 'mars'])
  })

  it('starts on the rover asked for, else VIPER, else the first', () => {
    expect(initialRover(ROVERS, 'mapp')?.id).toBe('mapp')
    expect(initialRover(ROVERS, 'nope')?.id).toBe('viper')
    expect(initialRover(ROVERS)?.id).toBe('viper')
    expect(initialRover([rover('lrv')], 'nope')?.id).toBe('lrv')
    expect(initialRover([])).toBeNull()
  })

  it('asks GET /rovers and returns the Moon ones first', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      seen.push(url)
      return Promise.resolve(new Response(JSON.stringify({ rovers: [...ROVERS].reverse() }), { status: 200 }))
    })
    const got = await getRovers(new AbortController().signal)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/\/rovers$/)
    expect(got.map((r) => r.body)).toEqual(['moon', 'moon', 'moon', 'moon', 'mars', 'mars', 'mars', 'mars'])
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('Darkness tolerance', () => {
  it('is the number the API gives, not one the screen computes', () => {
    const edited: Rover = { ...rover('viper'), darkness_tolerance_hours: 12.5 }
    expect(darknessToleranceHours(edited)).toBe(12.5)
    expect(darknessToleranceHours({ ...rover('curiosity') })).toBeNull()
  })

  // The GLOSSARY says stored energy over the draw in shadow; the example must agree with it.
  it('agrees in the example with battery over the draw the RTG leaves', () => {
    for (const r of ROVERS) {
      const tolerance = darknessToleranceHours(r)
      if (r.rtg_w >= r.power_shadow_w) {
        expect(tolerance, r.id).toBeNull()
      } else {
        expect(tolerance, r.id).toBeCloseTo(r.battery_wh / (r.power_shadow_w - r.rtg_w), 1)
      }
    }
  })

  it('marks it as estimated when the battery, the draw or the RTG is', () => {
    expect(isEstimated(rover('viper'), 'darkness_tolerance_hours')).toBe(false)
    expect(isEstimated(rover('lrv'), 'darkness_tolerance_hours')).toBe(true) // draw estimated
    expect(isEstimated(rover('mer'), 'darkness_tolerance_hours')).toBe(true) // battery estimated
    expect(isEstimated(rover('curiosity'), 'darkness_tolerance_hours')).toBe(true)
    // Only a field the catalogue does not list for the other inputs: mass of the LTV does not touch it.
    const massOnly: Rover = { ...rover('viper'), estimated: ['mass_kg'] }
    expect(isEstimated(massOnly, 'darkness_tolerance_hours')).toBe(false)
  })
})

describe('estimated fields', () => {
  it('marks exactly the fields the API lists', () => {
    expect(isEstimated(rover('ltv'), 'mass_kg')).toBe(true)
    expect(isEstimated(rover('ltv'), 'slope_limit_deg')).toBe(false)
    expect(isEstimated(rover('lrv'), 'power_shadow_w')).toBe(true)
    expect(isEstimated(rover('lrv'), 'battery_wh')).toBe(false)
    expect(isEstimated(rover('viper'), 'mass_kg')).toBe(false)
    expect(isEstimated(rover('viper'), 'battery_wh')).toBe(false)
  })

  it('has a source for every rover and says which numbers are estimates in the example', () => {
    for (const r of ROVERS) expect(r.source_reference.length, r.id).toBeGreaterThan(10)
    expect(rover('mapp').estimated).toContain('battery_wh')
    expect(rover('viper').estimated).toEqual([])
  })
})

describe('Mission fit', () => {
  it('fits when the Darkness tolerance reaches the LCSP, with the margin', () => {
    const fit = missionFit(rover('viper'), 50)
    expect(fit.kind).toBe('fits')
    expect(fit.kind === 'fits' && fit.marginHours).toBeCloseTo(7.05, 2)
  })

  it('does not fit when the LCSP is longer, with the gap', () => {
    const fit = missionFit(rover('viper'), 60)
    expect(fit.kind).toBe('short')
    expect(fit.kind === 'short' && fit.gapHours).toBeCloseTo(2.95, 2)
    expect(missionFit(rover('mapp'), 10)).toEqual({ kind: 'short', gapHours: 6.5 })
  })

  it('fits with no margin when the two are equal', () => {
    expect(missionFit(rover('mapp'), 3.5)).toEqual({ kind: 'fits', marginHours: 0 })
  })

  it('has no limit when the RTG covers the load', () => {
    expect(missionFit(rover('curiosity'), 300)).toEqual({ kind: 'rtg' })
  })

  it('has no night to get through when the LCSP is zero', () => {
    expect(missionFit(rover('mapp'), 0)).toEqual({ kind: 'no-night' })
    expect(missionFit(rover('curiosity'), 0)).toEqual({ kind: 'no-night' })
  })

  it('says a rover with no panels and no RTG cannot recharge', () => {
    expect(cannotRecharge(rover('lrv'))).toBe(true)
    expect(cannotRecharge(rover('viper'))).toBe(false)
    expect(cannotRecharge(rover('curiosity'))).toBe(false)
  })
})

describe('the mission and its Window', () => {
  it('offers 2025 to 2032 and starts on 2027 for 10 days, as the cockpit does', () => {
    expect(MISSION_YEARS[0]).toBe(2025)
    expect(MISSION_YEARS[MISSION_YEARS.length - 1]).toBe(2032)
    expect(MISSION_YEARS).toHaveLength(8)
    expect(DEFAULT_YEAR).toBe(2027)
    expect(DEFAULT_DAYS).toBe(10)
    expect(MISSION_DAYS).toContain(DEFAULT_DAYS)
    expect(defaultMission()).toEqual({ year: 2027, days: 10, requireDte: true, window: { start: '2027-01-01T00:00:00Z', durationHours: 240 } })
  })

  it('maps year and days to 00:00 UTC on 1 January and days times 24 h', () => {
    expect(missionWindow(2025, 3)).toEqual({ start: '2025-01-01T00:00:00Z', durationHours: 72 })
    expect(missionWindow(2032, 30)).toEqual({ start: '2032-01-01T00:00:00Z', durationHours: 720 })
    expect(buildMission(2030, 14, false)).toEqual({ year: 2030, days: 14, requireDte: false, window: { start: '2030-01-01T00:00:00Z', durationHours: 336 } })
  })

  it('writes the start the way the contract takes an instant', () => {
    for (const year of MISSION_YEARS) {
      const { start } = missionWindow(year, 7)
      expect(start).toBe(toApiInstant(new Date(Date.UTC(year, 0, 1))))
    }
  })

  it('ends durationHours after the start', () => {
    const window = missionWindow(2027, 10)
    expect(windowEndMs(window)).toBe(Date.UTC(2027, 0, 11))
  })

  it('checks the Window against the coverage the engine reports', () => {
    const coverage: Coverage = {
      custom_max_latitude_deg: -80,
      window_min: '2026-01-01T00:00:00Z',
      window_max: '2030-01-01T00:00:00Z',
      max_duration_hours: 720,
    }
    expect(windowInCoverage(missionWindow(2027, 10), coverage)).toBe(true)
    expect(windowInCoverage(missionWindow(2025, 10), coverage)).toBe(false) // starts before
    expect(windowInCoverage(missionWindow(2030, 3), coverage)).toBe(false) // ends after
    expect(windowInCoverage(missionWindow(2029, 30), coverage)).toBe(true)
    expect(windowInCoverage(missionWindow(2029, 30), { ...coverage, max_duration_hours: 600 })).toBe(false) // longer than it takes
  })
})

describe('the mast as the Observer height', () => {
  it('suggests the mast height', () => {
    expect(suggestedObserverHeight(rover('viper'))).toBe(2.45)
    expect(suggestedObserverHeight(rover('sojourner'))).toBe(0.3)
  })

  it('keeps it inside what the Query takes', () => {
    expect(suggestedObserverHeight({ ...rover('viper'), mast_height_m: 80 })).toBe(HEIGHT_MAX_M)
  })
})

describe('how a rover reads in a sentence', () => {
  it('drops the parenthesis from the name', () => {
    expect(shortName(rover('curiosity'))).toBe('Curiosity')
    expect(shortName(rover('viper'))).toBe('VIPER')
    expect(shortName(rover('lrv'))).toBe('Lunar Roving Vehicle')
  })

  it('keeps the description of a Moon rover as it is', () => {
    expect(describeRover(rover('viper'), 'en')).toBe('South pole ice hunter, 1 m drill, three upright solar panels')
    expect(describeRover(rover('viper'), 'pt')).toBe('Caçador de gelo do polo sul, broca de 1 m, três painéis solares em pé')
  })

  it('leaves the "what if it went to the Moon?" to the label, so it is said once', () => {
    expect(describeRover(rover('sojourner'), 'en')).toBe('10.6 kg, six 13 cm wheels')
    expect(describeRover(rover('sojourner'), 'pt')).toBe('10,6 kg, seis rodas de 13 cm')
    expect(describeRover(rover('mer'), 'en')).toBe('')
    expect(describeRover(rover('perseverance'), 'pt')).toBe('')
  })

  it('has the label in front of every Mars description the API gives', () => {
    for (const r of ROVERS.filter((candidate) => candidate.body === 'mars')) {
      expect(r.description?.en, r.id).toMatch(/^What if it went to the Moon\?/)
      expect(r.description?.pt, r.id).toMatch(/^E se fosse à Lua\?/)
    }
  })
})
