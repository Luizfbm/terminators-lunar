import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { VisibilityResult } from '../api/client'
import { bands, evenTicks, fractionOf, type Band } from '../domain/timeline'
import { sampleAt } from '../domain/sky'
import { useI18n } from '../i18n/I18nContext'
import { CursorSun } from './cursorSun/CursorSun'
import { ChargeStrip } from './phase4/battery/Battery'
import { DsnBand } from './phase4/dsn/DsnBand'

import type { Vehicle } from './vehiclePicker/vehicles'
import { timeAtPointer } from '../domain/timelinePointer'
import { intervalsOf } from '../domain/intervals'
import { countdownLine } from './landing/countdownText'
import { batteryAt, seriesTimes } from './landing/batteryAtCursor'
import { CountdownAside, useVehicleEnergy, VehicleBatteryRow, VehicleBatteryNote } from './landing/TimelineReadouts'

const HOUR_MS = 3_600_000
const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`

function Row({ kind, items, label, aside }: { kind: 'sun' | 'earth'; items: Band[]; label: string; aside?: ReactNode }) {
  return (
    <div className={`strip__row strip__row--${kind}`}>
      <span className="strip__name">{label}</span>
      <div className="strip__bar">
        {items.map((band, index) => (
          <i
            key={index}
            className={`strip__band strip__band--${band.kind}`}
            data-kind={band.kind}
            style={{ left: percent(band.left), width: percent(band.width) }}
          />
        ))}
      </div>
      {aside}
    </div>
  )
}

/** The Window as a strip: Sun and Earth rows, and the Cursor, which is the main control of the screen. */
export function TimeStrip({
  result,
  cursorMs,
  playing,
  shortShadowMaxHours,
  onCursor,
  onPlay,
  inert = false,
  vehicle = null,
}: {
  result: VisibilityResult
  vehicle?: Vehicle | null
  cursorMs: number
  playing: boolean
  shortShadowMaxHours: number
  onCursor: (ms: number) => void
  /** Out of reach while the cover is over the app. */
  inert?: boolean
  onPlay: () => void
}) {
  const { t, formatDay, formatDateTime, formatNumber } = useI18n()
  const startMs = Date.parse(result.query.start)
  const endMs = Date.parse(result.query.end)
  const energy = useVehicleEnergy(result.query, vehicle)
  const charge = energy.state.status === 'ready' ? energy.state.data : null
  const reading = charge ? batteryAt(charge.charge_fraction, seriesTimes(result.timeline.samples.map((sample) => sample.t), charge.charge_fraction.length, startMs, endMs, charge.step_minutes), cursorMs) : null
  const sunCountdown = countdownLine(intervalsOf(result.periods, 'sun', 'visible', startMs, endMs), cursorMs, endMs)
  const earthCountdown = countdownLine(intervalsOf(result.periods, 'earth', 'visible', startMs, endMs), cursorMs, endMs)
  const rows = bands(result.periods, startMs, endMs)
  const sunFraction = sampleAt(result.timeline.samples, cursorMs)?.sun.fraction ?? null
  const hasShortShadow = rows.sun.some((band) => band.kind === 'shortShadow')

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const plot = event.currentTarget.querySelector('.strip__bar')
    if (!plot) return
    const box = plot.getBoundingClientRect()
    onCursor(timeAtPointer(event.clientX, box.left, box.width, startMs, endMs))
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = (event.shiftKey ? 24 : 1) * HOUR_MS
    if (event.key === 'ArrowRight') onCursor(cursorMs + step)
    else if (event.key === 'ArrowLeft') onCursor(cursorMs - step)
    else if (event.key === 'Home') onCursor(startMs)
    else if (event.key === 'End') onCursor(endMs)
    else return
    event.preventDefault()
  }

  return (
    <footer className="strip" inert={inert}>
      <button type="button" className="strip__play" onClick={onPlay} aria-label={t(playing ? 'strip.pause' : 'strip.play')}>
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      </button>
      <p className="strip__now">
        <span>{t('strip.cursor')}</span> {formatDateTime(cursorMs)} <CursorSun fraction={sunFraction} />
      </p>
      {/* On a phone the assistant's Ask button is put here, so it never floats over the page
          (the requirement). React leaves it empty; AskButton fills it through a portal. */}
      <span className="strip__ask" />
      <div
        className="strip__track"
        role="slider"
        tabIndex={0}
        aria-label={t('strip.cursor')}
        aria-valuemin={startMs}
        aria-valuemax={endMs}
        aria-valuenow={Math.round(cursorMs)}
        aria-valuetext={formatDateTime(cursorMs)}
        onKeyDown={onKey}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          fromPointer(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event)
        }}
      >
        <Row kind="sun" items={rows.sun} label={t('strip.sun')} aside={<CountdownAside line={sunCountdown} body="sun" />} />
        <Row kind="earth" items={rows.earth} label={t('strip.earth')} aside={<CountdownAside line={earthCountdown} body="earth" />} />
        <DsnBand result={result} />
        {vehicle ? <VehicleBatteryRow result={result} vehicle={vehicle} energy={energy.state} reading={reading} /> : <ChargeStrip result={result} />}
        <div className="strip__cursor-axis"><span className="strip__cursor" style={{ left: percent(fractionOf(cursorMs, startMs, endMs)) }} /></div>
      </div>
      <div className="strip__ticks" aria-hidden="true">
        {evenTicks(startMs, endMs, 4).map((tick, index) => (
          <span key={tick.ms} className={index % 2 ? 'strip__tick strip__tick--minor' : 'strip__tick'} style={{ left: percent(tick.fraction) }}>
            {formatDay(tick.ms)}
          </span>
        ))}
      </div>
      {vehicle && <VehicleBatteryNote vehicle={vehicle} energy={energy.state} onRetry={energy.retry} />}
      {hasShortShadow && <p className="strip__legend">{t('strip.shortShadow', { hours: formatNumber(shortShadowMaxHours) })}</p>}
    </footer>
  )
}
