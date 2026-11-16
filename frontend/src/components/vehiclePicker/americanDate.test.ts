import { expect, it } from 'vitest'
import { americanDate, parseAmericanDate } from './americanDate'
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
