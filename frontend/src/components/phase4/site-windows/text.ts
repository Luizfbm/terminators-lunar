import { useI18n } from '../../../i18n/I18nContext'
import type { I18n } from '../../../i18n/i18n'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export type Catalogue = Record<string, string>

/**
 * A panel's own strings, in the app's language, with the app's number and date formats. The
 * catalogue is the panel's, so the frontend requirement copies it with the component.
 */
export function usePanelText<K extends string>(catalogues: { en: Record<K, string>; pt: Record<K, string> }) {
  const i18n = useI18n()
  const catalogue = catalogues[i18n.locale]
  const t = (key: K, params?: Record<string, string>) =>
    catalogue[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)
  return { ...i18n, t }
}

/** Hours as the app says a span: "21 d 4 h", "9 h 30 min". */
export function span(i18n: Pick<I18n, 'formatSpan'>, hours: number): string {
  return i18n.formatSpan(hours * HOUR_MS)
}

/** A whole number of hours for the metrics line, glued to its unit. */
export function wholeHours(i18n: Pick<I18n, 'formatNumber'>, hours: number): string {
  return `${i18n.formatNumber(Math.round(hours))}\u00a0h`
}

/** The UTC day a Window starts on, as a date. */
export function dayOf(i18n: Pick<I18n, 'formatDate'>, iso: string): string {
  return i18n.formatDate(Date.parse(iso))
}

export const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS)
