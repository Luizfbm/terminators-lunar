import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { ShiftedWindow, SiteWindows } from '../site-windows/types'
import { INK, MARKS, STEPS, stepOf, stepRange } from '../site-windows/scale'
import { span, usePanelText } from '../site-windows/text'
import { en, pt } from './strings'

const DAY_MS = 86_400_000
interface Day {
  /** Day of the year, 0 for 1 January. */
  index: number
  month: number
  date: number
  ms: number
  window: ShiftedWindow | null
}

function daysOf(year: number, windows: ShiftedWindow[]): Day[] {
  const byDay = new Map(windows.map((w) => [w.start.slice(0, 10), w]))
  const days: Day[] = []
  for (let ms = Date.UTC(year, 0, 1), index = 0; new Date(ms).getUTCFullYear() === year; ms += DAY_MS, index++) {
    const at = new Date(ms)
    days.push({ index, month: at.getUTCMonth(), date: at.getUTCDate(), ms, window: byDay.get(at.toISOString().slice(0, 10)) ?? null })
  }
  return days
}

function monthName(locale: string, month: number): string {
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-GB', { month: 'short', timeZone: 'UTC' })
    .format(Date.UTC(2000, month, 1))
    .replace('.', '')
}

/**
 * The year as a wall calendar: one square per start day, months as rows (columns on a narrow
 * screen), coloured by the share of the Window with the Sun and the Earth together.
 */
export function Calendar({
  year,
  data,
  lengthText,
  queryDay,
  onDay,
}: {
  year: number
  data: SiteWindows
  lengthText: string
  /** The UTC day of the Query's start, "2027-03-12", ringed when it is in this year. */
  queryDay: string | null
  onDay: (window: ShiftedWindow) => void
}) {
  const text = usePanelText({ en, pt })
  const { t, locale, formatPercent } = text
  const days = useMemo(() => daysOf(year, data.windows), [year, data.windows])
  const marks = useMemo(() => {
    const found = new Map<string, string>()
    // The worst first, so a day that is both best and worst (a flat year) keeps the best mark.
    found.set(data.worst.start.slice(0, 10), MARKS.worst)
    found.set(data.typical.start.slice(0, 10), MARKS.typical)
    found.set(data.best.start.slice(0, 10), MARKS.best)
    return found
  }, [data])
  const queryIndex = days.findIndex((d) => new Date(d.ms).toISOString().slice(0, 10) === queryDay)
  const [focus, setFocus] = useState(queryIndex >= 0 ? queryIndex : 0)
  const [pointed, setPointed] = useState<number | null>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const missing = days.some((d) => d.window === null)

  const shown = pointed ?? (queryIndex >= 0 ? queryIndex : null)
  const describe = (day: Day) => {
    const date = text.formatDate(day.ms)
    const w = day.window
    if (!w) return t('readout.missing', { date })
    const params = {
      date,
      both: span(text, w.sun_and_earth_hours),
      share: formatPercent(w.sun_and_earth_hours / data.duration_hours),
      dark: span(text, w.lcsp_hours),
    }
    return t(w.lcsp_hours === 0 ? 'readout.dayNoNight' : 'readout.day', params)
  }
  const readout = shown === null ? t('readout.hint') : describe(days[shown])

  const move = (event: KeyboardEvent, index: number) => {
    const day = days[index]
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, Home: -(day.date - 1) }
    let next = index + (step[event.key] ?? 0)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // The same date in the next or previous month, or that month's last day.
      const month = day.month + (event.key === 'ArrowDown' ? 1 : -1)
      const candidates = days.filter((d) => d.month === month)
      if (candidates.length === 0) return
      next = (candidates.find((d) => d.date === day.date) ?? candidates[candidates.length - 1]).index
    } else if (event.key === 'End') {
      next = days.filter((d) => d.month === day.month).at(-1)!.index
    } else if (!(event.key in step)) {
      return
    }
    event.preventDefault()
    next = Math.max(0, Math.min(days.length - 1, next))
    setFocus(next)
    setPointed(next)
    buttons.current[next]?.focus()
  }

  return (
    <figure className="p4cal">
      <figcaption className="p4cal__caption">{t('calendar.caption', { year: String(year), length: lengthText })}</figcaption>
      <div className="p4cal__grid" role="group" aria-label={t('calendar.label', { year: String(year) })} onPointerLeave={() => setPointed(null)}>
        {Array.from({ length: 12 }, (_, month) => (
          <span key={`m${month}`} className="p4cal__month" style={{ '--m': month + 1 } as CSSProperties} aria-hidden="true">
            {monthName(locale, month)}
          </span>
        ))}
        {[1, 5, 10, 15, 20, 25, 31].map((date) => (
          <span key={`d${date}`} className="p4cal__date" style={{ '--d': date } as CSSProperties} aria-hidden="true">
            {date}
          </span>
        ))}
        {days.map((day) => {
          const w = day.window
          const step = w ? stepOf(w.sun_and_earth_hours / data.duration_hours) : null
          const iso = new Date(day.ms).toISOString().slice(0, 10)
          const mark = marks.get(iso)
          return (
            <button
              key={iso}
              ref={(node) => {
                buttons.current[day.index] = node
              }}
              type="button"
              className={`p4cal__day${w ? '' : ' p4cal__day--missing'}`}
              style={
                {
                  '--m': day.month + 1,
                  '--d': day.date,
                  background: step === null ? undefined : STEPS[step],
                  color: step === null ? undefined : INK[step],
                } as CSSProperties
              }
              tabIndex={day.index === focus ? 0 : -1}
              aria-label={describe(day)}
              aria-current={iso === queryDay ? 'date' : undefined}
              disabled={!w}
              onPointerEnter={() => setPointed(day.index)}
              onFocus={() => {
                setFocus(day.index)
                setPointed(day.index)
              }}
              onKeyDown={(event) => move(event, day.index)}
              onClick={() => w && onDay(w)}
            >
              {mark && <span aria-hidden="true">{mark}</span>}
            </button>
          )
        })}
      </div>
      <p className="p4cal__readout" aria-live="polite">
        {readout}
      </p>
      <div className="p4cal__legend">
        <p className="p4cal__legendTitle">{t('legend.title')}</p>
        <ol className="p4cal__steps">
          {STEPS.map((colour, step) => {
            const [from, to] = stepRange(step)
            return (
              <li key={colour}>
                <span className="p4cal__swatch" style={{ background: colour }} aria-hidden="true" />
                {t('legend.step', { from: String(from), to: String(to) })}
              </li>
            )
          })}
        </ol>
        <p>{t('legend.marks')}</p>
        {missing && <p>{t('legend.missing')}</p>}
      </div>
    </figure>
  )
}
