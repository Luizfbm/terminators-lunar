import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '../../../i18n/i18n'
import { getSiteHazard, type SiteHazard } from './hazardApi'
import { ellipseShare, isMinority, shareText } from './shareLogic'
import { en, pt, type MeasuredKey } from './strings'

// The contract's own example for AR06 (read at run time: the web image copies frontend/ only).
const HERE = dirname(fileURLToPath(import.meta.url))
const AR06 = (JSON.parse(readFileSync(resolve(HERE, '../../../../../contract/examples/site-hazard-ar06.example.json'), 'utf8')) as { value: SiteHazard }).value

const english = createI18n('en', 'en-GB')
const portuguese = createI18n('pt', 'pt-BR')

const line = (catalogue: Record<MeasuredKey, string>, share: number, formatPercent: (fraction: number) => string) =>
  catalogue[isMinority(share) ? 'measured.minority' : 'measured.majority'].replace('{share}', shareText(share, formatPercent))

describe('the measured share of the Landing ellipse (AR06 example)', () => {
  it('is the ellipse fraction as the API returns it', () => {
    expect(ellipseShare(AR06.measured)).toBe(0.011138)
  })

  it('says "only 1%" in English, with the rest interpolated', () => {
    expect(line(en, 0.011138, english.formatPercent)).toBe(
      'Only 1% of the ground inside the Landing ellipse was measured by the laser; the rest is interpolated.',
    )
  })

  it('says "só 1%" in Portuguese', () => {
    expect(line(pt, 0.011138, portuguese.formatPercent)).toBe(
      'Só 1% do chão dentro da elipse de pouso foi medido pelo laser; o resto é interpolado.',
    )
  })

  it('says nothing without 5 m data (the API sends null)', () => {
    expect(ellipseShare({ ellipse_fraction: null, grid_fraction: null })).toBeNull()
  })

  it('never reads a share that is not zero as "0%", and drops "only" from half up', () => {
    expect(shareText(0.003, english.formatPercent)).toBe('<1%')
    expect(shareText(0, english.formatPercent)).toBe('0%')
    expect(shareText(0.0236, portuguese.formatPercent)).toBe('2%')
    expect(isMinority(0.49)).toBe(true)
    expect(isMinority(0.5)).toBe(false)
    expect(line(en, 0.8, english.formatPercent)).toBe('80% of the ground inside the Landing ellipse was measured by the laser; the rest is interpolated.')
  })

  it('has the same keys in both languages and no mention of AI', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    expect([...Object.values(en), ...Object.values(pt)].join(' ')).not.toMatch(/\bAI\b|\bIA\b|artificial|neural/i)
  })
})

describe('asking for the hazard numbers', () => {
  afterEach(() => vi.unstubAllGlobals())

  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('asks once per Site, whoever asks, and returns the same answer', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(reply(AR06)))
    vi.stubGlobal('fetch', fetchMock)
    const [first, second] = await Promise.all([getSiteHazard('ONCE'), getSiteHazard('ONCE')])
    expect(first.site_id).toBe('AR06')
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/sites/ONCE/hazard')
  })

  it('forgets a failed ask, so the next one tries again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ code: 'not_found' }, 404))
      .mockResolvedValueOnce(reply(AR06))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSiteHazard('RETRY')).rejects.toThrow()
    await expect(getSiteHazard('RETRY')).resolves.toMatchObject({ site_id: 'AR06' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
