import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n/i18n'
import { headlineKey, movedPast } from './headline'
import { statement, type Body } from './statement'
import hw03 from './testdata/hw03_reference.json'

const at = (stamp: string) => Date.parse(stamp)
const START = at(hw03.start)
const END = at(hw03.end)
const en = createI18n('en', 'en-GB')
const pt = createI18n('pt', 'pt-BR')

/** The headline as the screen words it, with the number left as its placeholder. */
function headline(body: Body, cursorMs: number, lang = en): string {
  const said = statement(body, hw03.periods, hw03.events, cursorMs, END)
  return lang.t(headlineKey(body, said.kind, movedPast(body, hw03.periods, hw03.events, START, cursorMs)))
}

describe('the headline at Haworth HW03, in the validation Window', () => {
  // Validation check: with the Cursor on 6 December the headline said
  // "The Sun does not set in this Window", with two Sunsets already behind the Cursor.
  it('never says the Window has no Sunset once the Cursor is past one', () => {
    const cursor = at('2026-12-06T12:00:00Z')
    expect(headline('sun', cursor)).toBe('From the Cursor on, the Sun does not set again in this Window.')
    expect(headline('sun', cursor, pt)).toBe('A partir do Cursor, o Sol não se põe mais nesta Janela.')
    expect(headline('sun', cursor)).not.toBe(en.t('sun.stays'))
  })

  it('keeps the plain words while nothing has changed since the start of the Window', () => {
    // At the start the Cursor sits at "now", some hours in: no Sunset yet, so nothing to qualify.
    expect(headline('sun', at('2026-11-14T15:00:00Z'))).toBe('The Sun sets in {span}.')
    expect(headline('earth', at('2026-11-14T15:00:00Z'), pt)).toBe('A Terra some em {span}.')
  })

  it('counts from the Cursor in every state, for the Sun and for the Earth', () => {
    // Between the two Sunsets: up, a Sunset behind and one ahead.
    expect(headline('sun', at('2026-11-24T00:00:00Z'))).toBe('From the Cursor, the Sun sets in {span}.')
    expect(headline('sun', at('2026-11-24T00:00:00Z'), pt)).toBe('A partir do Cursor, o Sol se põe em {span}.')
    // In the second dark stretch.
    expect(headline('sun', at('2026-11-29T00:00:00Z'))).toBe('At the Cursor the Sun is down. It rises in {span}.')
    expect(headline('sun', at('2026-11-29T00:00:00Z'), pt)).toBe('No Cursor, o Sol está oculto. Ele nasce em {span}.')
    // The Earth set on 20 November and is back on 29 November.
    expect(headline('earth', at('2026-11-24T00:00:00Z'))).toBe('At the Cursor the Earth is out of sight. It rises in {span}.')
    expect(headline('earth', at('2026-11-24T00:00:00Z'), pt)).toBe('No Cursor, a Terra está fora de vista. Ela aparece em {span}.')
    expect(headline('earth', at('2026-12-06T12:00:00Z'))).toBe('From the Cursor on, the Earth stays in sight for the rest of this Window.')
    expect(headline('earth', at('2026-12-06T12:00:00Z'), pt)).toBe('A partir do Cursor, a Terra fica à vista até o fim da Janela.')
  })

  it('says the body is gone for the rest of the Window when it does not come back', () => {
    const sunsetOnly = [{ type: 'sunset', t: '2026-11-19T23:31:00Z' }]
    const night = [
      { body: 'sun', state: 'visible', start: hw03.start, end: '2026-11-19T23:31:00Z' },
      { body: 'sun', state: 'hidden', start: '2026-11-19T23:31:00Z', end: hw03.end },
    ]
    const cursor = at('2026-11-25T00:00:00Z')
    const said = statement('sun', night, sunsetOnly, cursor, END)
    const key = headlineKey('sun', said.kind, movedPast('sun', night, sunsetOnly, START, cursor))
    expect(en.t(key)).toBe('From the Cursor on, the Sun does not rise again in this Window.')
    expect(pt.t(key)).toBe('A partir do Cursor, o Sol não volta a nascer nesta Janela.')
    const earthKey = headlineKey('earth', 'gone', true)
    expect(en.t(earthKey)).toBe('From the Cursor on, the Earth stays out of sight for the rest of this Window.')
    expect(pt.t(earthKey)).toBe('A partir do Cursor, a Terra fica fora de vista até o fim da Janela.')
  })
})

describe('movedPast', () => {
  it('is true only once a change of that body lies between the start and the Cursor', () => {
    expect(movedPast('sun', hw03.periods, hw03.events, START, START)).toBe(false)
    expect(movedPast('sun', hw03.periods, hw03.events, START, at('2026-11-19T23:30:00Z'))).toBe(false)
    // A Sunset exactly at the Cursor has already happened.
    expect(movedPast('sun', hw03.periods, hw03.events, START, at('2026-11-19T23:31:00Z'))).toBe(true)
    // The Earth changes on its own clock: still nothing for it before 20 November.
    expect(movedPast('earth', hw03.periods, hw03.events, START, at('2026-11-20T00:00:00Z'))).toBe(false)
    expect(movedPast('earth', hw03.periods, hw03.events, START, at('2026-11-20T10:00:00Z'))).toBe(true)
  })

  it('reads the periods too, when the events list leaves a change out', () => {
    expect(movedPast('sun', hw03.periods, [], START, at('2026-11-22T00:00:00Z'))).toBe(true)
  })
})
