import { useId, useState, type ReactNode } from 'react'
import { useOnDemand } from '../../../hooks/useLadder'
import { loadHazard, type HazardData } from './api'
import { InspectorCanvas } from './InspectorCanvas'
import {
  clampPercent,
  coarseGridsOf,
  fairSentence,
  formatterFor,
  intervalText,
  levelsOf,
  readRun,
  runFor,
  sliderRange,
} from './logic'
import { errorKey, text, type HazardKey, type InspectorLocale } from './strings'
import type { CoarseGrid, ConfidenceLevel, HazardRun } from './types'
import './inspector.css'

const FALSE_ALARM_START = 15
const LEVEL_START: ConfidenceLevel = 'P90'

export interface HazardInspectorProps {
  /** The Site's id, as the API knows it (`/sites/{site_id}/hazard`). */
  siteId: string
  /** The language on screen. Pass the app's own (`useI18n().locale`). */
  locale: InspectorLocale
  /** Shows a close button when given. */
  onClose?: () => void
}

/** Loads the numbers and the grid for a Site, then shows the inspector. */
export function HazardInspector({ siteId, locale, onClose }: HazardInspectorProps) {
  const { state, retry } = useOnDemand<HazardData>(true, siteId, (signal) => loadHazard(siteId, signal))
  const t = (key: HazardKey, params?: Record<string, string>) => text(locale, key, params)

  if (state.status === 'ready') return <HazardInspectorView data={state.data} locale={locale} onClose={onClose} />
  return (
    <section className="hazard" aria-labelledby="hazard-title-loading">
      <header className="hazard__head">
        <h2 id="hazard-title-loading" className="hazard__title">
          {t('hazard.title')}
        </h2>
        {onClose && <CloseButton label={t('hazard.close')} onClose={onClose} />}
      </header>
      {state.status === 'error' ? (
        <div className="hazard__status" role="alert">
          <p>{t('hazard.errorTitle')}</p>
          <p>{t(errorKey(state.code))}</p>
          <button type="button" className="hazard__button" onClick={retry}>
            {t('hazard.retry')}
          </button>
        </div>
      ) : (
        <p className="hazard__status" role="status">
          {t('hazard.loading')}
        </p>
      )}
    </section>
  )
}

function CloseButton({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button type="button" className="hazard__close" onClick={onClose} aria-label={label}>
      ✕
    </button>
  )
}

/** A sentence with `{name}` values set apart in mono, the way the other panels set theirs. */
function withValues(sentence: string): ReactNode {
  return sentence.split(/(\d[\d.,\s]*%|\d[\d.,]*\skm)/g).map((part, index) => (index % 2 === 1 ? <b key={index}>{part}</b> : part))
}

export interface HazardInspectorViewProps {
  data: HazardData
  locale: InspectorLocale
  onClose?: () => void
  /** Where the controls start; the coarse grid and level fall back to what the API has. */
  initial?: { coarse?: CoarseGrid; level?: ConfidenceLevel; falseAlarmPercent?: number; curtain?: number }
}

/** The inspector for data already loaded. Exported so a story or a test can hand it the contract's examples. */
export function HazardInspectorView({ data, locale, onClose, initial }: HazardInspectorViewProps) {
  const { hazard, grid } = data
  const ids = useId()
  const t = (key: HazardKey, params?: Record<string, string>) => text(locale, key, params)
  const format = formatterFor(locale)

  const available = coarseGridsOf(hazard)
  const [coarse, setCoarse] = useState<CoarseGrid>(
    initial?.coarse && available.includes(initial.coarse) ? initial.coarse : (available[0] ?? 60),
  )
  const run: HazardRun | undefined = runFor(hazard, coarse)
  const levels = run ? levelsOf(run) : []
  const [level, setLevel] = useState<ConfidenceLevel>(initial?.level ?? LEVEL_START)
  const [falseAlarm, setFalseAlarm] = useState(initial?.falseAlarmPercent ?? FALSE_ALARM_START)
  const [curtain, setCurtain] = useState(initial?.curtain ?? 0.5)

  const title = (
    <header className="hazard__head">
      <h2 id={`${ids}-title`} className="hazard__title">
        {t('hazard.title')}
      </h2>
      {onClose && <CloseButton label={t('hazard.close')} onClose={onClose} />}
    </header>
  )

  if (hazard.grid === null || grid === null || !run) {
    return (
      <section className="hazard" aria-labelledby={`${ids}-title`}>
        {title}
        <p className="hazard__status" role="status">
          {t('hazard.noGrid')}
        </p>
      </section>
    )
  }

  const gridRef = hazard.grid
  const range = sliderRange(run)
  const shownLevel = levels.includes(level) ? level : (levels[0] ?? level)
  const percent = range ? clampPercent(falseAlarm, range) : falseAlarm
  const reading = readRun(run, shownLevel, percent)
  const limit = format.number(hazard.slope_limit_deg, 0)
  const coarseSteep = hazard.stats ? (coarse === 20 ? hazard.stats.over_limit_fraction_20m : hazard.stats.over_limit_fraction_60m) : null

  return (
    <section className="hazard" aria-labelledby={`${ids}-title`}>
      {title}

      <p className="hazard__ownership">
        {withValues(t('hazard.ownership', { grid: gridRef.id, distance: format.number(gridRef.distance_km, 1) }))}{' '}
        {t(gridRef.site_inside ? 'hazard.inside' : 'hazard.outside')}
      </p>

      <div className="hazard__controls">
        <div className="hazard__group" role="group" aria-label={t('hazard.coarseLabel')}>
          <span className="hazard__label">{t('hazard.coarseLabel')}</span>
          {available.map((m) => (
            <button
              key={m}
              type="button"
              className="hazard__pill"
              aria-pressed={m === coarse}
              onClick={() => setCoarse(m)}
            >
              {t('hazard.coarseOption', { m: String(m) })}
            </button>
          ))}
        </div>
        <div className="hazard__group" role="group" aria-label={t('hazard.levelLabel')}>
          <span className="hazard__label">{t('hazard.levelLabel')}</span>
          {levels.map((name) => (
            <button
              key={name}
              type="button"
              className="hazard__pill"
              aria-pressed={name === shownLevel}
              onClick={() => setLevel(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <InspectorCanvas
        grid={grid}
        gridRef={gridRef}
        coarse={coarse}
        level={shownLevel}
        limitDeg={hazard.slope_limit_deg}
        curtain={curtain}
        onCurtain={setCurtain}
        locale={locale}
      />

      <div className="hazard__field">
        <label htmlFor={`${ids}-curtain`} className="hazard__label">
          {t('hazard.curtainLabel')}
        </label>
        <input
          id={`${ids}-curtain`}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(curtain * 100)}
          aria-describedby={`${ids}-curtain-help`}
          onChange={(event) => setCurtain(Number(event.target.value) / 100)}
        />
        <p id={`${ids}-curtain-help`} className="hazard__help">
          {t('hazard.curtainHelp')}
        </p>
      </div>

      <ul className="hazard__legend">
        <li>
          <i className="hazard__swatch hazard__swatch--coarse" />
          {t('hazard.legendCoarse', { limit })}
        </li>
        <li>
          <i className="hazard__swatch hazard__swatch--hidden" />
          {t('hazard.legendHidden', { limit })}
        </li>
        <li>
          <i className="hazard__swatch hazard__swatch--seen" />
          {t('hazard.legendSeen', { limit })}
        </li>
        <li>
          <i className="hazard__swatch hazard__swatch--ldec" />
          {t('hazard.legendLdec')}
        </li>
      </ul>
      <p className="hazard__help">{t('hazard.mapNote')}</p>

      <section className="hazard__block" aria-labelledby={`${ids}-fair`}>
        <h3 id={`${ids}-fair`} className="hazard__subtitle">
          {t('hazard.fairTitle', { fa: format.wholePercent(percent) })}
        </h3>
        {range && (
          <div className="hazard__field">
            <label htmlFor={`${ids}-fa`} className="hazard__label">
              {t('hazard.falseAlarmLabel')}: <b>{format.wholePercent(percent)}</b>
            </label>
            <input
              id={`${ids}-fa`}
              type="range"
              min={range.min}
              max={range.max}
              step={1}
              value={percent}
              aria-describedby={`${ids}-fa-help`}
              onChange={(event) => setFalseAlarm(Number(event.target.value))}
            />
            <p id={`${ids}-fa-help`} className="hazard__help">
              {t('hazard.falseAlarmHelp')}
            </p>
          </div>
        )}
        {reading && (
          <>
            <p className="hazard__say">{withValues(fairSentence(locale, format, reading))}</p>
            <dl className="hazard__kpis">
              {reading.fair && (
                <>
                  <Kpi label={t('hazard.fairNormal')} value={format.percent(reading.fair.normal)} />
                  <Kpi label={t('hazard.fairMulti')} value={format.percent(reading.fair.multi)} tone="good" />
                  {reading.fair.reductionPercent !== null && (
                    <Kpi
                      label={t('hazard.fairReduction')}
                      value={`${reading.fair.reductionPercent >= 0 ? '−' : '+'}${format.wholePercent(Math.abs(reading.fair.reductionPercent))}`}
                      tone="good"
                    />
                  )}
                </>
              )}
              <Kpi
                label={t('hazard.fairMedian')}
                value={`${format.number(reading.medianError.normal, 2)}° → ${format.number(reading.medianError.multi, 2)}°${
                  reading.medianError.reductionPercent === null
                    ? ''
                    : ` (${reading.medianError.reductionPercent >= 0 ? '−' : '+'}${format.wholePercent(Math.abs(reading.medianError.reductionPercent))})`
                }`}
              />
            </dl>
          </>
        )}
      </section>

      {reading && (
        <section className="hazard__block" aria-labelledby={`${ids}-nominal`}>
          <h3 id={`${ids}-nominal`} className="hazard__subtitle">
            {t('hazard.nominalTitle')}
          </h3>
          <ul className="hazard__rows">
            <li>
              {t('hazard.nominalRow', {
                navigation: t('hazard.normal'),
                missed: intervalText(locale, format, reading.normal.missed_hazard),
                falseAlarm: intervalText(locale, format, reading.normal.false_alarm),
              })}
            </li>
            <li>
              {t('hazard.nominalRow', {
                navigation: `${t('hazard.multi')} ${shownLevel}`,
                missed: intervalText(locale, format, reading.multi.missed_hazard),
                falseAlarm: intervalText(locale, format, reading.multi.false_alarm),
              })}
            </li>
          </ul>
          <p className="hazard__help">{t('hazard.nominalNote', { level: shownLevel })}</p>
        </section>
      )}

      <section className="hazard__block" aria-labelledby={`${ids}-terrain`}>
        <h3 id={`${ids}-terrain`} className="hazard__subtitle">
          {t('hazard.terrainTitle')}
        </h3>
        <dl className="hazard__kpis">
          {hazard.stats && <Kpi label={t('hazard.terrainSteep5', { limit })} value={format.percent(hazard.stats.over_limit_fraction_5m)} />}
          {coarseSteep !== null && (
            <Kpi label={t('hazard.terrainSteepCoarse', { limit, m: String(coarse) })} value={format.percent(coarseSteep)} />
          )}
          {hazard.measured.grid_fraction !== null && (
            <Kpi label={t('hazard.terrainMeasured')} value={format.percent(hazard.measured.grid_fraction)} />
          )}
        </dl>
        <p className="hazard__help">
          {gridRef.lroc.images_covering > 0 && gridRef.lroc.best_resolution_m_px !== null
            ? t('hazard.lroc', { count: String(gridRef.lroc.images_covering), resolution: format.number(gridRef.lroc.best_resolution_m_px, 2) })
            : t('hazard.lrocNone')}{' '}
          {gridRef.lroc.viewer_url && (
            <a href={gridRef.lroc.viewer_url} target="_blank" rel="noreferrer">
              {t('hazard.lrocLink')}
            </a>
          )}
        </p>
      </section>

      <p className="hazard__source">{t('hazard.source', { source: hazard.source_reference })}</p>
    </section>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className={tone ? `hazard__kpi hazard__kpi--${tone}` : 'hazard__kpi'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
