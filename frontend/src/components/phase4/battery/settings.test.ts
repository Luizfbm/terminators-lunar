import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { azimuthOf, energyParams, landerOf, pointedLanderOf } from './api'
import { toleranceFromLink } from '../site-windows/request'
import { readPanels, readSettings, writeSettings, type PanelsDraft } from './settings'
import type { EnergyResult } from './types'

const SUN: PanelsDraft = { pointing: 'sun' }

describe('the battery in the link', () => {
  it('reads back what it wrote, and leaves the other parameters alone', () => {
    const settings = { tolerance: 50, open: true, draft: { panel: '450', load: '108.4', battery: '5420' }, panels: SUN }
    const search = writeSettings(settings, '?site=001&view=ground')
    expect(search).toBe('?site=001&view=ground&tolerance=50&charge=1&lander=450%2C108.4%2C5420')
    expect(readSettings(search)).toEqual(settings)
  })

  // Merge of the implementation and the implementation, 2026-11-14: the battery wrote `dark` and the launch slip read
  // `tolerance`, so a tolerance typed in the battery never reached the slip.
  it('writes the Darkness tolerance where the launch slip reads it', () => {
    const search = writeSettings({ tolerance: 36.5, open: false, draft: { panel: '', load: '', battery: '' }, panels: SUN }, '?site=001')
    expect(toleranceFromLink(search)).toBe(36.5)
    expect(readSettings('?site=001&tolerance=48').tolerance).toBe(toleranceFromLink('?site=001&tolerance=48'))
  })

  it('keeps a lander half typed', () => {
    expect(readSettings('?lander=450,,').draft).toEqual({ panel: '450', load: '', battery: '' })
  })

  it('removes its parameters when they are empty', () => {
    expect(writeSettings({ tolerance: null, open: false, draft: { panel: '', load: '', battery: '' }, panels: SUN }, '?tolerance=5&charge=1&lander=1,2,3&panels=flat&site=001')).toBe('?site=001')
  })

  it('ignores a tolerance that is not a number of hours', () => {
    for (const bad of ['abc', '-3', '']) expect(readSettings(`?tolerance=${bad}`).tolerance, bad).toBeNull()
  })
})

describe('the lander the fields describe', () => {
  it('needs all three numbers within the contract bounds', () => {
    expect(landerOf({ panel: '450', load: '108.4', battery: '5420' })).toEqual({ panel_power_w: 450, load_w: 108.4, battery_wh: 5420 })
    expect(landerOf({ panel: '0', load: '0.1', battery: '1' })).toEqual({ panel_power_w: 0, load_w: 0.1, battery_wh: 1 })
    expect(landerOf({ panel: '450', load: '', battery: '5420' })).toBeNull()
    expect(landerOf({ panel: '450', load: '0', battery: '5420' })).toBeNull()
    expect(landerOf({ panel: '450', load: '100', battery: '0.5' })).toBeNull()
    expect(landerOf({ panel: '-1', load: '100', battery: '500' })).toBeNull()
  })

  // Luiz's example (the implementation): the load is 5,420 Wh ÷ 50 h, our derivation, and the preset must say 50 h.
  it('puts VIPER’s derived load at its battery over its 50 hours', async () => {
    const { VIPER, VIPER_TOLERANCE_HOURS } = await import('./Battery')
    expect(Number(VIPER.battery) / VIPER_TOLERANCE_HOURS).toBeCloseTo(Number(VIPER.load), 10)
  })
})

// the requirement: where the panels face, after Eduardo's panel-geometry model.
describe('the panels’ pointing in the link', () => {
  const empty = { panel: '', load: '', battery: '' }

  it('writes fixed with its azimuth and flat by name, and reads them back', () => {
    for (const panels of [{ pointing: 'fixed', azimuth: '90' }, { pointing: 'flat' }] as PanelsDraft[]) {
      const search = writeSettings({ tolerance: null, open: true, draft: empty, panels }, '?site=001')
      expect(readSettings(search).panels).toEqual(panels)
    }
    expect(writeSettings({ tolerance: null, open: false, draft: empty, panels: { pointing: 'fixed', azimuth: '213.5' } }, '')).toBe('?panels=fixed%3A213.5')
  })

  it('reads a link without it, or with anything it does not know, as facing the Sun', () => {
    for (const raw of [null, '', 'sun', 'tracking', 'up:90']) expect(readPanels(raw), String(raw)).toEqual({ pointing: 'sun' })
    expect(readSettings('?site=001').panels).toEqual({ pointing: 'sun' })
  })

  it('keeps an azimuth half typed, as it does the lander', () => {
    expect(readPanels('fixed:')).toEqual({ pointing: 'fixed', azimuth: '' })
    expect(readPanels('fixed')).toEqual({ pointing: 'fixed', azimuth: '' })
    expect(readSettings('?panels=fixed:9').panels).toEqual({ pointing: 'fixed', azimuth: '9' })
  })

  it('leaves the default out of the link', () => {
    expect(writeSettings({ tolerance: null, open: false, draft: empty, panels: SUN }, '?panels=flat')).toBe('')
  })
})

describe('the request for a pointed lander', () => {
  const viper = { panel: '450', load: '108.4', battery: '5420' }
  const query = {
    site: { id: '001' },
    start: '2025-03-22T00:00:00Z',
    duration_hours: 240,
    observer_height_m: 2,
  } as unknown as Parameters<typeof energyParams>[0]

  it('takes an azimuth from 0 up to, not including, 360', () => {
    expect(azimuthOf('0')).toBe(0)
    expect(azimuthOf('359.9')).toBe(359.9)
    for (const bad of ['', ' ', '360', '-1', 'east']) expect(azimuthOf(bad), bad).toBeNull()
  })

  it('always says where the panels face, and sends the azimuth only with fixed', () => {
    const sun = energyParams(query, pointedLanderOf(viper, SUN)!)
    expect(sun.get('panel_pointing')).toBe('sun')
    expect(sun.has('panel_azimuth_deg')).toBe(false)
    const flat = energyParams(query, pointedLanderOf(viper, { pointing: 'flat' })!)
    expect(flat.get('panel_pointing')).toBe('flat')
    expect(flat.has('panel_azimuth_deg')).toBe(false)
    const fixed = energyParams(query, pointedLanderOf(viper, { pointing: 'fixed', azimuth: '90' })!)
    expect(fixed.get('panel_pointing')).toBe('fixed')
    expect(fixed.get('panel_azimuth_deg')).toBe('90')
    expect(fixed.get('panel_power_w')).toBe('450')
  })

  it('asks nothing while fixed panels have no azimuth, or the lander is not whole', () => {
    expect(pointedLanderOf(viper, { pointing: 'fixed', azimuth: '' })).toBeNull()
    expect(pointedLanderOf(viper, { pointing: 'fixed', azimuth: '360' })).toBeNull()
    expect(pointedLanderOf({ ...viper, load: '' }, { pointing: 'flat' })).toBeNull()
  })

  it('matches the contract example for panels fixed facing east', () => {
    const example = JSON.parse(
      readFileSync(new URL('../../../../../contract/examples/visibility-energy-001-fixed-east.example.json', import.meta.url), 'utf8'),
    ) as { value: EnergyResult }
    const lander = pointedLanderOf({ panel: '400', load: '100', battery: '2000' }, { pointing: 'fixed', azimuth: '90' })
    expect(lander).toEqual(example.value.lander)
    expect(example.value.panel_lit_hours).toBeGreaterThan(0)
  })
})

// the requirement, approved by Luiz: once the panels do not face the Sun, the Darkness tolerance is read
// against the longest stretch with no light on them, not against the LCSP.
describe('what the Darkness tolerance is read against', () => {
  const fixed = JSON.parse(
    readFileSync(new URL('../../../../../contract/examples/visibility-energy-001-fixed-east.example.json', import.meta.url), 'utf8'),
  ).value as EnergyResult

  it('is the longest dark stretch on the panels for fixed or flat panels', async () => {
    const { panelsDarkHours } = await import('./Battery')
    expect(fixed.panel_longest_dark_hours).toBeGreaterThan(fixed.lcsp_hours)
    expect(panelsDarkHours({ status: 'ready', data: fixed })).toBe(fixed.panel_longest_dark_hours)
    const flat = { ...fixed, lander: { ...fixed.lander, panel_pointing: 'flat' as const } }
    expect(panelsDarkHours({ status: 'ready', data: flat })).toBe(fixed.panel_longest_dark_hours)
  })

  it('stays on the LCSP facing the Sun, without a pointing, or while there is no answer', async () => {
    const { panelsDarkHours } = await import('./Battery')
    const sun = { ...fixed, lander: { ...fixed.lander, panel_pointing: 'sun' as const } }
    expect(panelsDarkHours({ status: 'ready', data: sun })).toBeNull()
    const bare = { panel_power_w: 400, load_w: 100, battery_wh: 2000 }
    expect(panelsDarkHours({ status: 'ready', data: { ...fixed, lander: bare } })).toBeNull()
    expect(panelsDarkHours({ status: 'loading' })).toBeNull()
    expect(panelsDarkHours({ status: 'idle' })).toBeNull()
  })
})
