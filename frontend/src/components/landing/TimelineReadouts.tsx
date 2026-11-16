import type { PointerEvent } from 'react'
import type { VisibilityResult } from '../../api/client'
import type { PanelState } from '../../hooks/useLadder'
import { useI18n } from '../../i18n/I18nContext'
import { useEnergy } from '../phase4/battery/api'
import { ChargeRow } from '../phase4/battery/Battery'
import { FACING_SUN } from '../phase4/battery/settings'
import type { EnergyResult } from '../phase4/battery/types'
import type { Vehicle } from '../vehiclePicker/vehicles'
import type { BatteryReading } from './batteryAtCursor'
import { hoursSpan, type CountdownLine } from './countdownText'
import { estimatedBatteryFigures, vehicleDraft } from './vehicleLander'
import './timeline.css'

/** The readings sit inside the slider: a press on them must not move the Cursor to the Window's end. */
const keepCursor = (event: PointerEvent) => event.stopPropagation()

/** The words of the readings, shared by what is drawn and the line read out to screen readers. */
export function useTimelineText() {
  const { t, formatNumber, formatPercent } = useI18n()
  const span = (ms: number, hoursOnly = false) => {
    const { hours, days } = hoursSpan(ms)
    return days === null || hoursOnly
      ? t('timeline.hours', { hours: formatNumber(hours) })
      : t('timeline.hoursDays', { hours: formatNumber(hours), days: formatNumber(days) })
  }
  const countdown = (line: CountdownLine, body: 'sun' | 'earth') => {
    if (line.says === 'noReturn' || line.ms === null) return t('timeline.noReturn')
    // The prototype keeps only the hours inside the brackets of "until the end".
    if (line.says === 'untilEnd') return t('timeline.untilEnd', { span: span(line.ms, true) })
    return t(line.says === 'loses' ? `timeline.${body}.loses` : `timeline.${body}.back`, { span: span(line.ms) })
  }
  const battery = (reading: BatteryReading): [string, string | null] => {
    const now = t(`timeline.battery.${reading.state}`, { percent: formatPercent(reading.percent / 100) })
    const { next } = reading
    if (!next) return [now, null]
    if (next.ms === null) return [now, t(next.to === 'empty' ? 'timeline.battery.notEmpty' : 'timeline.battery.notFull')]
    return [now, t(next.to === 'empty' ? 'timeline.battery.emptyIn' : 'timeline.battery.fullIn', { span: span(next.ms) })]
  }
  return { countdown, battery }
}

/** The countdown at the right of the Sun or Earth row; muted red while the body is out of sight. */
export function CountdownAside({ line, body }: { line: CountdownLine; body: 'sun' | 'earth' }) {
  const text = useTimelineText()
  return (
    <span className={line.lost ? 'strip-count strip-count--lost' : 'strip-count'} data-countdown={line.says} onPointerDown={keepCursor}>
      {text.countdown(line, body)}
    </span>
  )
}

/** The rover's Charge across the Window, from the backend, with the panels facing the Sun. Idle with no rover. */
export function useVehicleEnergy(query: VisibilityResult['query'], vehicle: Vehicle | null | undefined) {
  return useEnergy(query, vehicleDraft(vehicle), FACING_SUN, Boolean(vehicle))
}

/**
 * The Battery row of the strip for the rover: the same drawing as the Charge row, with the battery at
 * the Cursor beside it. A * marks a row built on an estimated figure; the note under the strip says which.
 */
export function VehicleBatteryRow({
  result,
  vehicle,
  energy,
  reading,
}: {
  result: VisibilityResult
  vehicle: Vehicle
  energy: PanelState<EnergyResult>
  reading: BatteryReading | null
}) {
  const { t } = useI18n()
  const text = useTimelineText()
  const name = `${t('timeline.battery.row')}${estimatedBatteryFigures(vehicle).length > 0 ? '*' : ''}`
  if (energy.status === 'idle' || energy.status === 'error') return null
  if (energy.status === 'loading') {
    // Holds the row's place while the server answers, so the strip does not jump.
    return (
      <div className="strip__row charge-row" aria-hidden="true">
        <span className="strip__name">{name}</span>
        <div className="charge-row__plot" />
        <span className="strip-count strip-count--battery" onPointerDown={keepCursor}>
          {t('timeline.battery.loading')}
        </span>
      </div>
    )
  }
  const [now, next] = reading ? text.battery(reading) : [null, null]
  const aside = reading && (
    <span className={reading.state === 'empty' ? 'strip-count strip-count--battery strip-count--lost' : 'strip-count strip-count--battery'} data-battery={reading.state} onPointerDown={keepCursor}>
      <span>{now}</span>
      {next && <span>{next}</span>}
    </span>
  )
  return <ChargeRow data={energy.data} startMs={Date.parse(result.query.start)} endMs={Date.parse(result.query.end)} name={name} aside={aside} />
}

/** Under the strip: what the Battery row assumes, which figures are estimates, and a retry when it failed. */
export function VehicleBatteryNote({ vehicle, energy, onRetry }: { vehicle: Vehicle; energy: PanelState<EnergyResult>; onRetry: () => void }) {
  const { t } = useI18n()
  const estimated = estimatedBatteryFigures(vehicle)
  if (energy.status === 'error') {
    return (
      <p className="strip__legend strip-note" role="alert">
        {t('timeline.battery.failed')}{' '}
        <button type="button" className="strip-note__retry" onClick={onRetry}>
          {t('timeline.battery.retry')}
        </button>
      </p>
    )
  }
  if (energy.status !== 'ready') return null
  return (
    <p className="strip__legend strip-note">
      {t('timeline.battery.note', { rover: vehicle.name })}
      {estimated.length > 0 && (
        <>
          {' '}
          {t('timeline.battery.estimated', { figures: estimated.map((figure) => t(`timeline.figure.${figure}`)).join(', ') })}
        </>
      )}
    </p>
  )
}
