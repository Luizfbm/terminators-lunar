import { splitDuration, splitSpan } from '../domain/duration'
import { en, pt, type Locale, type MessageKey } from './messages'

export interface I18n {
  locale: Locale
  t: (key: MessageKey, params?: Record<string, string>) => string
  formatDate: (ms: number) => string
  formatTime: (ms: number) => string
  formatDateTime: (ms: number) => string
  formatDay: (ms: number) => string
  formatDuration: (ms: number) => string
  /** Days and hours from a day up; hours and minutes below that. */
  formatSpan: (ms: number) => string
  formatPercent: (fraction: number) => string
  formatNumber: (value: number) => string
}

/** Catalogue fallbacks, used when the browser language is not a valid BCP 47 tag. */
const FALLBACK_TAGS: Record<Locale, string> = { en: 'en-GB', pt: 'pt-BR' }
const CATALOGUES: Record<Locale, Record<MessageKey, string>> = { en, pt }

/** pt* browsers get Portuguese; everything else gets English. */
export function pickLocale(language: string): Locale {
  return language.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

/** Dates and numbers follow the browser's own language; only the copy follows the catalogue pick. */
export function dateLocaleFor(language: string, fallback: string): string {
  try {
    return Intl.getCanonicalLocales(language)[0] ?? fallback
  } catch {
    return fallback
  }
}

export function createI18n(locale: Locale, language: string): I18n {
  // Dates follow the browser's own tag while it speaks the chosen language; after a switch, the catalogue's.
  const tag = pickLocale(language) === locale ? dateLocaleFor(language, FALLBACK_TAGS[locale]) : FALLBACK_TAGS[locale]
  const catalogue = CATALOGUES[locale]
  // Always UTC and always 24-hour, so a Time reads the same in every browser.
  const date = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const time = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
  const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const numbers = new Intl.NumberFormat(tag)
  const percent = new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 })

  const t: I18n['t'] = (key, params) =>
    catalogue[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)

  const formatNumber = (value: number) => numbers.format(value)
  const formatDuration = (ms: number) => {
    const { hours, minutes } = splitDuration(ms)
    if (hours === 0) return t('duration.minutes', { value: formatNumber(minutes) })
    return t('duration.hoursMinutes', { hours: formatNumber(hours), minutes: formatNumber(minutes) })
  }

  return {
    locale,
    t,
    formatDate: (ms) => date.format(ms),
    formatTime: (ms) => time.format(ms),
    formatDateTime: (ms) => `${date.format(ms)}, ${time.format(ms)} UTC`,
    formatDay: (ms) => day.format(ms),
    formatDuration,
    formatSpan: (ms) => {
      const { days, hours } = splitSpan(ms)
      if (days === 0) return formatDuration(ms)
      return t('duration.daysHours', { days: formatNumber(days), hours: formatNumber(hours) })
    },
    formatPercent: (fraction) => percent.format(fraction),
    formatNumber,
  }
}
