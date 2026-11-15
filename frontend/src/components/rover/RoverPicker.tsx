import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useI18n } from '../../i18n/I18nContext'
import { useRovers } from './api'
import {
  DEFAULT_DAYS,
  DEFAULT_YEAR,
  MISSION_DAYS,
  MISSION_YEARS,
  buildMission,
  cannotRecharge,
  darknessToleranceHours,
  describeRover,
  initialRover,
  isEstimated,
  missionFit,
  shortName,
  suggestedObserverHeight,
  windowInCoverage,
  type MissionFit,
  type RoverField,
} from './mission'
import { RoverGlyph } from './RoverGlyph'
import { roverText, type RoverKey } from './strings'
import type { Coverage, Mission, Rover, RoverChoice } from './types'
import './rover.css'

const HOUR_MS = 3_600_000

export interface RoverPickerProps {
  /** Called once the rovers have loaded, and again whenever the rover, the year, the days or the DTE choice changes. */
  onChange: (choice: RoverChoice) => void
  /** The rover to start on. VIPER when absent or unknown. */
  initialRoverId?: string
  /** The mission to start on. 2027, 10 days, Earth needed, when absent. */
  initialMission?: Partial<Pick<Mission, 'year' | 'days' | 'requireDte'>>
  /** The Query's LCSP in hours. When given, each rover is compared with it (Mission fit); null means no night. */
  lcspHours?: number | null
  /** The engine's coverage (`/meta`). When given, a Window outside it is said so. */
  coverage?: Coverage
  /** When given, offers a button that puts the mast height in as the Query's Observer height. */
  onUseObserverHeight?: (heightM: number) => void
  /** The catalogue, when the page already holds it. Skips the request to `/rovers`. */
  rovers?: Rover[]
}

/** A sentence with its values set apart in bold, the way the battery sets its own. */
function withValues(sentence: string, values: Record<string, string>): ReactNode {
  return sentence.split(/\{(\w+)\}/).map((part, index) => (index % 2 === 1 ? <b key={index}>{values[part] ?? part}</b> : part))
}

const FIT_BADGE: Record<MissionFit['kind'], RoverKey | null> = {
  fits: 'rover.fitBadgeFits',
  short: 'rover.fitBadgeShort',
  rtg: 'rover.fitBadgeRtg',
  'no-night': null,
}

export function RoverPicker({ onChange, initialRoverId, initialMission, lcspHours, coverage, onUseObserverHeight, rovers }: RoverPickerProps) {
  const { locale, formatNumber, formatDate, formatSpan } = useI18n()
  const text = (key: RoverKey, params?: Record<string, string>) => roverText(locale, key, params)
  const titleId = useId()
  const dteId = useId()
  const dteHintId = useId()

  const { state, retry } = useRovers(rovers)
  const list = state.status === 'ready' ? state.data : null

  const [selectedId, setSelectedId] = useState(initialRoverId)
  const [year, setYear] = useState<number>(() => (MISSION_YEARS.some((y) => y === initialMission?.year) ? (initialMission?.year as number) : DEFAULT_YEAR))
  const [days, setDays] = useState<number>(() => (MISSION_DAYS.some((d) => d === initialMission?.days) ? (initialMission?.days as number) : DEFAULT_DAYS))
  const [requireDte, setRequireDte] = useState(initialMission?.requireDte ?? true)
  const lastOfBody = useRef<Partial<Record<Rover['body'], string>>>({})
  const cards = useRef<Record<string, HTMLButtonElement | null>>({})

  const rover = useMemo(() => (list ? initialRover(list, selectedId) : null), [list, selectedId])
  const mission = useMemo(() => buildMission(year, days, requireDte), [year, days, requireDte])
  const choice = useMemo<RoverChoice | null>(
    () => (rover ? { rover, mission, observerHeightM: suggestedObserverHeight(rover) } : null),
    [rover, mission],
  )

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    if (choice) onChangeRef.current(choice)
  }, [choice])

  const select = (next: Rover) => {
    lastOfBody.current[next.body] = next.id
    setSelectedId(next.id)
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section className="rover-picker" aria-labelledby={titleId}>
        <h2 id={titleId} className="rover-picker__title">
          {text('rover.title')}
        </h2>
        <p className="rover-picker__status" role="status">
          {text('rover.loading')}
        </p>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="rover-picker" aria-labelledby={titleId}>
        <h2 id={titleId} className="rover-picker__title">
          {text('rover.title')}
        </h2>
        <div className="rover-picker__status" role="alert">
          <p>{text('rover.error')}</p>
          <button type="button" className="rover-button" onClick={retry}>
            {text('rover.retry')}
          </button>
        </div>
      </section>
    )
  }
  if (!rover || !list) {
    return (
      <section className="rover-picker" aria-labelledby={titleId}>
        <h2 id={titleId} className="rover-picker__title">
          {text('rover.title')}
        </h2>
        <p className="rover-picker__status">{text('rover.empty')}</p>
      </section>
    )
  }

  const group = list.filter((candidate) => candidate.body === rover.body)
  const goToGroup = (body: Rover['body']) => {
    if (body === rover.body) return
    const wanted = list.find((candidate) => candidate.id === lastOfBody.current[body] && candidate.body === body)
    const next = wanted ?? list.find((candidate) => candidate.body === body)
    if (next) select(next)
  }
  const step = (by: number) => {
    const at = group.findIndex((candidate) => candidate.id === rover.id)
    const next = group[(at + by + group.length) % group.length]
    select(next)
    cards.current[next.id]?.focus()
  }
  const onCardKey = (event: KeyboardEvent) => {
    const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (by === undefined) return
    event.preventDefault()
    step(by)
  }

  const hours = (value: number) => formatNumber(Math.round(value * 10) / 10)
  const span = (value: number) => formatSpan(value * HOUR_MS)
  const fit = lcspHours === undefined || lcspHours === null ? null : missionFit(rover, lcspHours)
  const name = shortName(rover)
  const tolerance = darknessToleranceHours(rover)
  const estimatedAny = (['mass_kg', 'battery_wh', 'solar_w', 'rtg_w', 'power_shadow_w', 'mast_height_m', 'slope_limit_deg', 'darkness_tolerance_hours'] as const).some(
    (field) => isEstimated(rover, field),
  )

  const unit = (key: RoverKey) => `\u00a0${text(key)}`
  const stats: { field: RoverField; label: RoverKey; value: string }[] = [
    { field: 'darkness_tolerance_hours', label: 'rover.dark', value: tolerance === null ? text('rover.noLimit') : `${hours(tolerance)}${unit('rover.unitH')}` },
    { field: 'battery_wh', label: 'rover.battery', value: `${formatNumber(rover.battery_wh)}${unit('rover.unitWh')}` },
    { field: 'solar_w', label: 'rover.panels', value: rover.solar_w > 0 ? `${formatNumber(rover.solar_w)}${unit('rover.unitW')}` : text('rover.none') },
    { field: 'rtg_w', label: 'rover.rtg', value: rover.rtg_w > 0 ? `${formatNumber(rover.rtg_w)}${unit('rover.unitW')}` : text('rover.none') },
    { field: 'power_shadow_w', label: 'rover.shadow', value: `${formatNumber(rover.power_shadow_w)}${unit('rover.unitW')}` },
    { field: 'mass_kg', label: 'rover.mass', value: `${formatNumber(rover.mass_kg)}${unit('rover.unitKg')}` },
    { field: 'mast_height_m', label: 'rover.mast', value: `${formatNumber(rover.mast_height_m)}${unit('rover.unitM')}` },
    { field: 'slope_limit_deg', label: 'rover.slope', value: `${formatNumber(rover.slope_limit_deg)}${unit('rover.unitDeg')}` },
  ]

  let fitSentence: ReactNode = null
  if (fit && lcspHours !== undefined && lcspHours !== null) {
    const values = { name, lcsp: span(lcspHours), tolerance: tolerance === null ? '' : span(tolerance) }
    if (fit.kind === 'no-night') fitSentence = withValues(text('rover.fitNoNight'), values)
    else if (fit.kind === 'rtg') fitSentence = withValues(text('rover.fitRtg'), values)
    else if (fit.kind === 'fits') fitSentence = withValues(text('rover.fitFits'), { ...values, margin: span(fit.marginHours) })
    else fitSentence = withValues(text('rover.fitShort'), { ...values, gap: span(fit.gapHours) })
  }

  const outOfCoverage = coverage !== undefined && !windowInCoverage(mission.window, coverage)
  const heightM = suggestedObserverHeight(rover)
  const heightText = formatNumber(heightM)
  const description = describeRover(rover, locale)

  return (
    <section className="rover-picker" aria-labelledby={titleId}>
      <h2 id={titleId} className="rover-picker__title">
        {text('rover.title')}
      </h2>
      <p className="rover-picker__intro">{text('rover.intro')}</p>

      <div className="rover-groups" role="group" aria-label={text('rover.groups')}>
        <button type="button" className="rover-segment" aria-pressed={rover.body === 'moon'} onClick={() => goToGroup('moon')}>
          {text('rover.moon')}
        </button>
        <button type="button" className="rover-segment" aria-pressed={rover.body === 'mars'} onClick={() => goToGroup('mars')}>
          {text('rover.mars')} <span className="rover-groups__label">· {text('rover.marsLabel')}</span>
        </button>
      </div>

      <div className="rover-carousel">
        <button type="button" className="rover-button rover-carousel__step" onClick={() => step(-1)} aria-label={text('rover.prev')}>
          ‹
        </button>
        <div className="rover-carousel__row" role="radiogroup" aria-label={text('rover.list')}>
          {group.map((candidate) => {
            const on = candidate.id === rover.id
            const candidateTolerance = darknessToleranceHours(candidate)
            const candidateFit = lcspHours === undefined || lcspHours === null ? null : missionFit(candidate, lcspHours)
            const badge = candidateFit ? FIT_BADGE[candidateFit.kind] : null
            return (
              <button
                key={candidate.id}
                ref={(element) => {
                  cards.current[candidate.id] = element
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className="rover-card"
                data-fit={candidateFit?.kind}
                onClick={() => select(candidate)}
                onKeyDown={onCardKey}
              >
                <RoverGlyph rover={candidate} />
                <span className="rover-card__name">{shortName(candidate)}</span>
                {candidate.body === 'mars' ? <span className="rover-card__mars">{text('rover.marsLabel')}</span> : null}
                <span className="rover-card__dark">
                  {candidateTolerance === null ? text('rover.cardRtg') : text('rover.cardDark', { hours: hours(candidateTolerance) })}
                  {isEstimated(candidate, 'darkness_tolerance_hours') ? <span aria-hidden="true">*</span> : null}
                </span>
                {badge ? <span className="rover-card__fit">{text(badge)}</span> : null}
              </button>
            )
          })}
        </div>
        <button type="button" className="rover-button rover-carousel__step" onClick={() => step(1)} aria-label={text('rover.next')}>
          ›
        </button>
      </div>

      <article className="rover-detail" aria-live="polite">
        <header className="rover-detail__head">
          <h3 className="rover-detail__name">{rover.name}</h3>
          {rover.body === 'mars' ? <p className="rover-detail__mars">{text('rover.marsLabel')}</p> : null}
          {description ? <p className="rover-detail__desc">{description}</p> : null}
          {rover.body === 'mars' ? <p className="rover-detail__note">{text('rover.marsNote')}</p> : null}
        </header>

        <dl className="rover-stats">
          {stats.map((stat) => (
            <div key={stat.field} className="rover-stat" data-estimated={isEstimated(rover, stat.field) || undefined}>
              <dt>{text(stat.label)}</dt>
              <dd>
                {stat.value}
                {isEstimated(rover, stat.field) ? (
                  <span className="rover-estimated" title={text('rover.estimatedTitle')}>
                    <span aria-hidden="true">*</span>
                    <span className="rover-sr">{` (${text('rover.estimatedTitle')})`}</span>
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>

        {tolerance === null ? <p className="rover-detail__note">{text('rover.rtgCovers')}</p> : null}
        {cannotRecharge(rover) ? <p className="rover-detail__note">{text('rover.noRecharge')}</p> : null}
        {estimatedAny ? <p className="rover-detail__note rover-detail__legend">{text('rover.estimatedLegend')}</p> : null}
        <p className="rover-detail__source">
          <span>{text('rover.source')}: </span>
          {rover.source_reference}
        </p>

        {fitSentence ? (
          <div className="rover-fit" data-fit={fit?.kind}>
            <p>{fitSentence}</p>
            <p className="rover-detail__note">{text('rover.fitNote')}</p>
          </div>
        ) : null}
      </article>

      <fieldset className="rover-mission">
        <legend>{text('rover.mission')}</legend>

        <div className="rover-mission__bar">
          <span className="rover-mission__label">{text('rover.year')}</span>
          <div className="rover-segments" role="group" aria-label={text('rover.year')}>
            {MISSION_YEARS.map((value) => (
              <button key={value} type="button" className="rover-segment" aria-pressed={value === year} onClick={() => setYear(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="rover-mission__bar">
          <span className="rover-mission__label">{text('rover.days')}</span>
          <div className="rover-segments" role="group" aria-label={text('rover.days')}>
            {MISSION_DAYS.map((value) => (
              <button key={value} type="button" className="rover-segment" aria-pressed={value === days} onClick={() => setDays(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <p className="rover-detail__note">{text('rover.daysNote')}</p>

        <div className="rover-dte">
          <input id={dteId} type="checkbox" checked={requireDte} aria-describedby={dteHintId} onChange={(event) => setRequireDte(event.target.checked)} />
          <label htmlFor={dteId}>{text('rover.dte')}</label>
          <p id={dteHintId} className="rover-detail__note">
            {text('rover.dteHint')}
          </p>
        </div>

        <p className="rover-mission__window">
          {withValues(text('rover.window'), { start: formatDate(Date.parse(mission.window.start)), days: String(days) })}
        </p>
        {outOfCoverage && coverage ? (
          <p className="rover-mission__warning" role="alert">
            {text('rover.windowOut', {
              min: formatDate(Date.parse(coverage.window_min)),
              max: formatDate(Date.parse(coverage.window_max)),
              max_days: String(Math.floor(coverage.max_duration_hours / 24)),
            })}
          </p>
        ) : null}

        <p className="rover-mission__height">{withValues(text('rover.height'), { name, height: heightText })}</p>
        {onUseObserverHeight ? (
          <button type="button" className="rover-button" onClick={() => onUseObserverHeight(heightM)}>
            {text('rover.useHeight', { height: heightText })}
          </button>
        ) : null}
      </fieldset>
    </section>
  )
}
