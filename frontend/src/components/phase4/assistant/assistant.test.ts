import { describe, expect, it } from 'vitest'
import type { VisibilityResult } from '../../../api/client'
import { assistantQuery, assistantRequest, DEFAULT_RETRY_SECONDS, retryAfter } from './api'
import { markUntraced } from './marks'
import { fill, sourceLabel, STRINGS } from './strings'
import { MAX_QUESTION_LENGTH, type Turn } from './types'

const curated = {
  site: { id: '001', name: 'Connecting Ridge 001', latitude_deg: -89.45, longitude_deg: -137.3, source: 'curated', curated: true },
  start: '2026-11-14T00:00:00Z',
  end: '2026-12-13T12:43:48Z',
  duration_hours: 708.73,
  observer_height_m: 2,
  step_minutes: 10,
} as unknown as VisibilityResult['query']

const turn = (question: string, answer: string): Turn => ({
  question,
  reply: { answer, mode: 'model', numbers: { total: 0, traced: 0, untraced: [] }, sources: [] },
})

describe('the request', () => {
  it('names a Curated Site by its code and nothing else', () => {
    expect(assistantQuery(curated)).toEqual({ site_id: '001', start: '2026-11-14T00:00:00Z', duration_hours: 708.73, observer_height_m: 2 })
  })

  it('names a custom Site by its point, never by the id the API made up for it', () => {
    const custom = { ...curated, site: { ...curated.site, id: 'custom', source: 'custom', curated: false } } as VisibilityResult['query']
    const query = assistantQuery(custom)
    expect(query).not.toHaveProperty('site_id')
    expect(query).toMatchObject({ latitude_deg: -89.45, longitude_deg: -137.3 })
  })

  it('sends the conversation oldest first and ends with the new question', () => {
    const request = assistantRequest([turn('When?', 'In 9 days.'), turn('Why?', 'A ridge.')], 'And March?', 'pt', curated)
    expect(request.lang).toBe('pt')
    expect(request.messages.map((message) => `${message.role}:${message.content}`)).toEqual([
      'user:When?',
      'assistant:In 9 days.',
      'user:Why?',
      'assistant:A ridge.',
      'user:And March?',
    ])
    expect(request.query?.site_id).toBe('001')
  })

  it('keeps every message within the contract’s 2000 characters', () => {
    const long = 'x'.repeat(MAX_QUESTION_LENGTH + 500)
    const request = assistantRequest([turn('q', long)], long, 'en', null)
    for (const message of request.messages) expect(message.content.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH)
    expect(request).not.toHaveProperty('query')
  })
})

describe('the wait after a 503', () => {
  it('takes Retry-After when the browser may read it', () => {
    expect(retryAfter('12', 'ask again in 3 s')).toBe(12)
  })

  it('falls back on the wait the detail names, as both 503s of the server word it', () => {
    expect(retryAfter(null, 'Too many requests from one address; ask again in 7 s.')).toBe(7)
    expect(retryAfter(null, 'Every engine slot is taken; ask again in 10 s.')).toBe(10)
  })

  it('waits the engine queue’s own time when nothing says', () => {
    expect(retryAfter(null, undefined)).toBe(DEFAULT_RETRY_SECONDS)
    expect(retryAfter('soon', 'later')).toBe(DEFAULT_RETRY_SECONDS)
  })
})

describe('untraced numbers', () => {
  it('flags the untraced number where it stands and keeps the rest of the text', () => {
    const pieces = markUntraced('In March 2027 it has 412 hours, against 310.', ['412'])
    expect(pieces.map((piece) => piece.text).join('')).toBe('In March 2027 it has 412 hours, against 310.')
    expect(pieces.filter((piece) => piece.untraced).map((piece) => piece.text)).toEqual(['412'])
    expect(pieces.filter((piece) => piece.number && !piece.untraced).map((piece) => piece.text)).toEqual(['2027', '310'])
  })

  it('matches a number only as a whole', () => {
    const pieces = markUntraced('1412 is not 41, but 41 is.', ['41'])
    expect(pieces.findIndex((piece) => piece.untraced)).toBe(pieces.findIndex((piece) => piece.text === '41'))
    expect(pieces.filter((piece) => piece.untraced)).toHaveLength(1)
  })

  it('leaves the text alone when the untraced number is not in it', () => {
    expect(markUntraced('No numbers.', ['5']).some((piece) => piece.untraced)).toBe(false)
  })
})

describe('the strings', () => {
  it('has every string in both languages, with the same placeholders', () => {
    expect(Object.keys(STRINGS.pt).sort()).toEqual(Object.keys(STRINGS.en).sort())
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(holes(STRINGS.pt[key]), key).toEqual(holes(STRINGS.en[key]))
    }
  })

  it('fills placeholders and names an unknown source by its operationId', () => {
    expect(fill(STRINGS.en.busy, { seconds: '12' })).toMatch(/Ask again in 12\ss/)
    expect(sourceLabel(STRINGS.en, 'getVisibility')).toBe('The answer and its Numbers')
    expect(sourceLabel(STRINGS.pt, 'getSomethingNew')).toBe('getSomethingNew')
  })
})
