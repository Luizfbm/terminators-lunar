import { expect, it } from 'vitest'
import { americanDate, draftOf, parseAmericanDate, syncDraft } from './americanDate'
import { toChoiceWindow } from './pickWindow'
import { createI18n } from '../../i18n/i18n'

it('round trips midnight, noon and a leap day without moving the local instant', () => {
  for (const value of ['2026-11-15T00:20', '2026-11-15T12:00', '2028-02-29T23:59']) {
    expect(parseAmericanDate(americanDate(value))).toBe(value)
  }
  expect(americanDate('2026-11-15T00:20')).toBe('11/15/2026 12:20 AM')
  expect(americanDate('2026-11-15T12:00')).toBe('11/15/2026 12:00 PM')
  expect(toChoiceWindow(parseAmericanDate('11/15/2026 11:30 PM'), parseAmericanDate('11/16/2026 12:30 AM')).hours).toBe(1)
})

it('rejects invalid dates, ambiguous 24-hour inputs, and incomplete edits', () => {
  for (const text of ['02/29/2026 12:00 PM', '15/11/2026 12:00 PM', '11/15/2026 00:20 AM', '11/15/2026 13:00 PM', '11/15/2026 12:70 PM', '11/1']) {
    expect(parseAmericanDate(text)).toBe('')
  }
  expect(parseAmericanDate('11/15/2026', false)).toBe('2026-11-15')
})

it('formats the entire English interface in en-US even on a Portuguese browser', () => {
  const i18n = createI18n('en', 'pt-BR')
  const t = Date.parse('2026-11-15T23:20:00Z')
  expect(i18n.formatDate(t)).toBe('11/15/2026')
  expect(i18n.formatTime(t)).toBe('11:20 PM')
  expect(i18n.formatDateTime(t)).toBe('11/15/2026, 11:20 PM UTC')
  expect(i18n.formatNumber(12.5)).toBe('12.5')
})

it('keeps a half-typed date when the parent ignores it and holds its old value', () => {
  // Found on 15/11/2026 reviewing PR #168: the Window start (Where) and Plan B's date ignore an
  // incomplete date and keep their value, and the field then rewrote the text with that old value
  // on every keystroke, so a date could only be pasted whole, never typed.
  const applied = '2026-11-15'
  let draft = draftOf(applied, false)
  for (const typed of ['0', '03/0', '03/01/20']) {
    draft = syncDraft({ ...draft, text: typed }, applied, false)
    expect(draft.text).toBe(typed)
  }
  // The finished date is taken by the parent and comes back as the value: the text stays as typed.
  draft = syncDraft({ ...draft, text: '03/01/2027' }, '2027-03-01', false)
  expect(draft).toEqual({ seen: '2027-03-01', withTime: false, text: '03/01/2027' })
  // A value the visitor did not type (another control moved the Window) is written out.
  expect(syncDraft(draft, '2027-08-05', false).text).toBe('08/05/2027')
  // A parent that takes the empty value of a half-typed date (the rover picker) keeps the text too.
  expect(syncDraft({ ...draftOf('2026-11-15T12:00', true), text: '11/1' }, '', true).text).toBe('11/1')
})
