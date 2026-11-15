import { readSunFraction } from '../../domain/sunDisc'
import { useI18n } from '../../i18n/I18nContext'

/** What the Cursor reads for the Sun: how much of its disc is in view, from the Sun fraction of the sample there. */
export function CursorSun({ fraction, className = '' }: { fraction: number | null; className?: string }) {
  const { t, formatPercent } = useI18n()
  if (fraction === null) return null
  const reading = readSunFraction(fraction)
  const text =
    reading.kind === 'partial'
      ? t('cursorSun.partial', { percent: formatPercent(reading.percent / 100) })
      : t(reading.kind === 'full' ? 'cursorSun.full' : 'cursorSun.hidden')
  return (
    <span className={`cursor-sun ${className}`.trim()} data-sun-disc={reading.kind} data-sun-percent={reading.kind === 'partial' ? reading.percent : undefined}>
      {text}
    </span>
  )
}
