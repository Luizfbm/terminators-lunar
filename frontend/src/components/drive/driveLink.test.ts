import { describe, expect, it } from 'vitest'
import { readLink, writeLink } from '../../domain/query'
import { followLink, readDrive, sameDrive, writeDrive, type DriveState } from './driveLink'

const CLOSED: DriveState = { screen: null, roverId: null, year: null, days: null, requireDte: null, plan: null }
const OPEN: DriveState = { screen: 'simulation', roverId: 'ltv', year: 2029, days: 14, requireDte: false, plan: 'normal' }

describe('Rover and drive in the link', () => {
  it('is closed and holds nothing without the parameters', () => {
    expect(readDrive('')).toEqual(CLOSED)
    expect(readDrive('?site=CR01&layout=classic')).toEqual(CLOSED)
  })

  it('reads back everything it writes', () => {
    const query = writeDrive(OPEN)
    expect(query).toBe('?drive=simulation&rover=ltv&myear=2029&mdays=14&mdte=0&plan=normal')
    expect(readDrive(query)).toEqual(OPEN)
  })

  it('reads each of the four screens and no other', () => {
    for (const screen of ['rover', 'hazard', 'simulation', 'walk'] as const) expect(readDrive(`?drive=${screen}`).screen).toBe(screen)
    for (const bad of ['', 'map', 'Rover', 'walk ', '1', 'hazard,walk']) expect(readDrive(`?drive=${encodeURIComponent(bad)}`).screen, bad).toBeNull()
  })

  it('ignores a Rover id the catalogue could not have', () => {
    expect(readDrive('?rover=viper').roverId).toBe('viper')
    expect(readDrive('?rover=perseverance').roverId).toBe('perseverance')
    for (const bad of ['', '../route', 'a b', 'x'.repeat(41), 'v%00']) expect(readDrive(`?rover=${encodeURIComponent(bad)}`).roverId, bad).toBeNull()
  })

  it('ignores a year and a number of days the picker does not offer', () => {
    expect(readDrive('?myear=2025&mdays=3')).toMatchObject({ year: 2025, days: 3 })
    expect(readDrive('?myear=2032&mdays=30')).toMatchObject({ year: 2032, days: 30 })
    for (const bad of ['2024', '2033', '20.27', '-2027', 'abc', '']) expect(readDrive(`?myear=${bad}`).year, bad).toBeNull()
    for (const bad of ['4', '0', '31', '1e1', 'ten', '']) expect(readDrive(`?mdays=${bad}`).days, bad).toBeNull()
  })

  it('reads the Earth requirement only as 0 or 1', () => {
    expect(readDrive('?mdte=1').requireDte).toBe(true)
    expect(readDrive('?mdte=0').requireDte).toBe(false)
    for (const bad of ['', 'true', 'false', '2']) expect(readDrive(`?mdte=${bad}`).requireDte, bad).toBeNull()
  })

  it('reads the plan only as one of the two navigations', () => {
    expect(readDrive('?plan=normal').plan).toBe('normal')
    expect(readDrive('?plan=multiresolution').plan).toBe('multiresolution')
    for (const bad of ['', 'Normal', 'ai', 'swarm']) expect(readDrive(`?plan=${bad}`).plan, bad).toBeNull()
  })

  it('leaves the Query and the other panels as they are, in the order they were', () => {
    const keep = '?site=AR06&t=2026-11-20T12:00:00Z&flat=1&layout=classic'
    expect(writeDrive({ ...CLOSED, screen: 'hazard' }, keep)).toBe('?site=AR06&t=2026-11-20T12%3A00%3A00Z&flat=1&layout=classic&drive=hazard')
  })

  it('replaces its own parameters and drops them all when the sheet closes', () => {
    const open = writeDrive(OPEN, '?site=AR06')
    expect(writeDrive({ ...OPEN, screen: 'walk', plan: 'multiresolution' }, open)).toBe(
      '?site=AR06&drive=walk&rover=ltv&myear=2029&mdays=14&mdte=0&plan=multiresolution',
    )
    // Closed: what the sheet remembers is not in the link.
    expect(writeDrive({ ...OPEN, screen: null }, open)).toBe('?site=AR06')
    expect(writeDrive(CLOSED, '')).toBe('')
  })

  it('is carried by the App’s own link writer and reads back through its reader', () => {
    const current = writeDrive(OPEN, '?site=AR06&layout=classic')
    const state = readLink(current)
    // The App rewrites the link from its own state with the current query string as `keep`.
    const rewritten = writeLink(state, current)
    expect(readDrive(rewritten)).toEqual(OPEN)
    expect(readLink(rewritten)).toMatchObject({ site: 'AR06', classic: true })
  })

  it('compares states', () => {
    expect(sameDrive(OPEN, { ...OPEN })).toBe(true)
    expect(sameDrive(OPEN, { ...OPEN, plan: 'multiresolution' })).toBe(false)
    expect(sameDrive(OPEN, { ...OPEN, requireDte: null })).toBe(false)
    expect(sameDrive(CLOSED, { ...CLOSED, screen: 'rover' })).toBe(false)
  })

  it('follows a link that closes the sheet while keeping the choices it remembers', () => {
    expect(followLink(OPEN, '?site=AR06')).toEqual({ ...OPEN, screen: null })
    // A link that opens it says everything itself.
    expect(followLink({ ...OPEN, plan: 'normal' }, '?drive=hazard&rover=viper')).toEqual({ ...CLOSED, screen: 'hazard', roverId: 'viper' })
  })
})
