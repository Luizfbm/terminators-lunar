import { AmericanDateInput } from './vehiclePicker/AmericanDateInput'
import { useState, type KeyboardEvent } from 'react'
import type { Meta, Site, VisibilityResult } from '../api/client'
import {
  clampNumber,
  type Coordinate,
  DEFAULT_CHOICE,
  HEIGHT_MAX_M,
  HEIGHT_MIN_M,
  isDefaultChoice,
  maxDays,
  startDayRange,
  utcDay,
  type Choice,
} from '../domain/query'
import { useI18n } from '../i18n/I18nContext'
import { SitePicker } from './SitePicker'

/** A number typed into the line: kept as a draft while typing, sent on Enter or when focus leaves. */
export function NumberField({
  value,
  min,
  max,
  step,
  label,
  onCommit,
}: {
  value: number
  min: number
  max: number
  step: number
  label: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const typed = Number(draft.replace(',', '.'))
    setDraft(null)
    if (draft.trim() !== '' && Number.isFinite(typed)) {
      const next = clampNumber(typed, min, max)
      if (next !== value) onCommit(next)
    }
  }
  return (
    <input
      className="site where__number"
      type="number"
      inputMode="decimal"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}

const HOUR_MS = 3_600_000

/** The Query in one line: which Site, which Window, from what height. The Window and height are editable. */
export function Where({
  result,
  meta,
  sites,
  choice,
  onSite,
  onCoordinate,
  onChoice,
}: {
  result: VisibilityResult
  meta: Meta
  sites: readonly Site[]
  choice: Choice
  onSite: (siteId: string) => void
  onCoordinate: (coordinate: Coordinate) => void
  onChoice: (choice: Choice) => void
}) {
  const { t, formatDay } = useI18n()
  const { query } = result
  const startMs = Date.parse(query.start)
  const days = Math.round((query.duration_hours / 24) * 10) / 10
  const range = startDayRange(meta.coverage, query.duration_hours)

  // A value equal to the default goes back to null, so the link stays plain.
  const pick = (patch: Partial<Choice>) => {
    // A day picked here starts at 00:00 UTC: a time set before a landing goes with it.
    const next = { ...choice, ...patch, ...('startDay' in patch ? { startTime: null } : {}) }
    if (next.startDay === utcDay(Date.now())) next.startDay = null
    if (next.hours !== null && Math.abs(next.hours - meta.defaults.duration_hours) < 1e-6) next.hours = null
    if (next.heightM !== null && next.heightM === meta.defaults.observer_height_m) next.heightM = null
    onChoice(next)
  }

  return (
    <div className="where">
      <SitePicker
        sites={sites}
        site={query.site}
        maxLatitudeDeg={meta.coverage.custom_max_latitude_deg}
        onSite={onSite}
        onCoordinate={onCoordinate}
      />
      <span>
        <AmericanDateInput
          className="site where__date"
          withTime={false}
          aria-label={t('window.start')}
          min={range.min}
          max={range.max}
          value={utcDay(startMs)}
          onChange={(day) => {
            if (day && day >= range.min && day <= range.max) pick({ startDay: day })
          }}
        />{' '}
        {t('window.for')}{' '}
        <NumberField
          key={`days-${days}`}
          value={days}
          min={1}
          max={maxDays(meta.coverage)}
          step={0.5}
          label={t('window.days')}
          onCommit={(value) => {
            // A longer Window must still end inside the coverage: pull the start back if it would not.
            const hours = value * 24
            const latest = startDayRange(meta.coverage, hours).max
            pick({ hours, ...(utcDay(startMs) > latest ? { startDay: latest } : {}) })
          }}
        />
        {t('window.daysUnit', { end: formatDay(startMs + query.duration_hours * HOUR_MS) })}
      </span>
      <span>
        {t('window.heightBefore')}{' '}
        <NumberField
          key={`height-${query.observer_height_m}`}
          value={query.observer_height_m}
          min={HEIGHT_MIN_M}
          max={HEIGHT_MAX_M}
          step={0.5}
          label={t('window.height')}
          onCommit={(heightM) => pick({ heightM })}
        />
        {t('window.heightUnit')}
      </span>
      <span>{t('where.utc')}</span>
      {!isDefaultChoice(choice) && (
        <button type="button" className="where__today" onClick={() => onChoice(DEFAULT_CHOICE)}>
          {t('window.today')}
        </button>
      )}
    </div>
  )
}
