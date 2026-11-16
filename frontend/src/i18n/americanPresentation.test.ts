import { expect, it } from 'vitest'
import { createI18n } from './i18n'

it('keeps English dates, numbers and times American even with a Portuguese browser tag', () => {
  for (const language of ['pt-BR', 'en-GB', 'en-US', 'fr-FR']) {
    const text = createI18n('en', language)
    expect(text.formatDateTime(Date.UTC(2026, 10, 20, 12))).toBe('11/20/2026, 12:00 PM UTC')
    expect(text.formatNumber(1234.5)).toBe('1,234.5')
  }
})

it('distinguishes midnight and noon in the American display without moving the UTC instant', () => {
  const text = createI18n('en', 'en-US')
  expect(text.formatTime(Date.UTC(2026, 10, 20, 0))).toBe('12:00 AM')
  expect(text.formatTime(Date.UTC(2026, 10, 20, 12))).toBe('12:00 PM')
})
