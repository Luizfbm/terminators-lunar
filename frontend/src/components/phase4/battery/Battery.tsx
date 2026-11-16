import { useId, useState, type ReactNode } from 'react'
import type { VisibilityResult } from '../../../api/client'
import type { PanelState } from '../../../hooks/useLadder'
import { useI18n } from '../../../i18n/I18nContext'
import { PanelStatus } from '../../PanelStatus'
import { landerOf, useEnergy } from './api'
import { updateSettings, useBatterySettings, type PanelsDraft } from './settings'
import type { BatteryKey } from './strings'
import type { EnergyResult, LanderDraft } from './types'
import './battery.css'

type EnergyState = PanelState<EnergyResult>

/**
 * The example lander: VIPER, as NASA gives it (Bluethmann, NTRS 20240013903, slide 2): 450 W with
 * the Sun on a corner, 5,420 Wh at start of life at 0 °C, 50 h in low power mode. The load is ours:
 * 5,420 Wh ÷ 50 h = 108.4 W, and the screen says so.
 */
export const VIPER: LanderDraft = { panel: '450', load: '108.4', battery: '5420' }
export const VIPER_TOLERANCE_HOURS = 50

const sameDraft = (a: LanderDraft, b: LanderDraft) =>
  Number(a.panel) === Number(b.panel) && Number(a.load) === Number(b.load) && Number(a.battery) === Number(b.battery) && a.panel !== '' && a.load !== '' && a.battery !== ''

const HOUR_MS = 3_600_000

/** A sentence with its values set apart in mono, the way the Countdown sets its own. */
function withValues(sentence: string, values: Record<string, string>): ReactNode {
  const parts = sentence.split(/\{(\w+)\}/)
  return parts.map((part, index) => (index % 2 === 1 ? <b key={index}>{values[part] ?? part}</b> : part))
}

/**
 * The simple reading: a Darkness tolerance the user types, against the LCSP already on screen. It
 * invents no hardware and needs nothing from the backend. Once the full reading has panels that do
 * not face the Sun (the implementation), the tolerance is read against the longest stretch with no light on them
 * instead, and the sentence says so.
 */
export function DarknessCheck({
  lcspHours,
  panelsDarkHours = null,
  tolerance,
  onTolerance,
}: {
  lcspHours: number
  /** The longest stretch with no light on the panels, when they do not face the Sun; else null. */
  panelsDarkHours?: number | null
  /** Hours, or null while the field is empty. */
  tolerance: number | null
  onTolerance: (hours: number | null) => void
}) {
  const { t, formatSpan } = useI18n()
  const field = useId()
  const hint = useId()
  const span = (hours: number) => formatSpan(hours * HOUR_MS)
  const panels = panelsDarkHours !== null
  const darkHours = panelsDarkHours ?? lcspHours
  const text = panels
    ? ({ none: 'dark.panelsNone', fits: 'dark.panelsFits', short: 'dark.panelsShort', bar: 'dark.barPanels' } as const)
    : ({ none: 'dark.noNight', fits: 'dark.fits', short: 'dark.short', bar: 'dark.barNight' } as const)
  let sentence: ReactNode
  if (darkHours === 0) sentence = t(text.none)
  else if (tolerance === null) sentence = t('dark.empty')
  else if (tolerance >= darkHours)
    sentence = withValues(t(text.fits), { lcsp: span(darkHours), tolerance: span(tolerance), margin: span(tolerance - darkHours) })
  else sentence = withValues(t(text.short), { lcsp: span(darkHours), tolerance: span(tolerance), gap: span(darkHours - tolerance) })

  const fits = tolerance !== null && tolerance >= darkHours
  const scale = Math.max(darkHours, tolerance ?? 0) || 1
  return (
    <div className="dark-check">
      <div className="battery-field">
        <label htmlFor={field}>{t('dark.label')}</label>
        <span className="battery-field__input">
          <input
            id={field}
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={tolerance ?? ''}
            aria-describedby={hint}
            onChange={(event) => {
              const value = event.target.value === '' ? null : Number(event.target.value)
              onTolerance(value !== null && Number.isFinite(value) && value >= 0 ? value : null)
            }}
          />
          <span aria-hidden="true">{t('dark.unit')}</span>
        </span>
        <p id={hint} className="battery-field__hint">
          {t('dark.hint')}
        </p>
        <p className="dark-check__example">
          <button type="button" className="charge__preset" aria-pressed={tolerance === VIPER_TOLERANCE_HOURS} onClick={() => onTolerance(VIPER_TOLERANCE_HOURS)}>
            {t('dark.example')}
          </button>
        </p>
        {tolerance === VIPER_TOLERANCE_HOURS && <p className="panel__note">{t('dark.exampleSource')}</p>}
      </div>
      <p className={`dark-check__say${tolerance !== null && darkHours > 0 ? (fits ? ' is-fits' : ' is-short') : ''}`} aria-live="polite">
        {sentence}
      </p>
      {darkHours > 0 && tolerance !== null && (
        <div className="dark-check__bars" aria-hidden="true">
          <span className="dark-check__name">{t(text.bar)}</span>
          <span className="dark-check__bar">
            <i className="dark-check__night" style={{ width: `${(darkHours / scale) * 100}%` }} />
          </span>
          <span className="dark-check__value">{span(darkHours)}</span>
          <span className="dark-check__name">{t('dark.barTolerance')}</span>
          <span className="dark-check__bar">
            <i className={fits ? 'dark-check__reserve' : 'dark-check__reserve is-short'} style={{ width: `${(tolerance / scale) * 100}%` }} />
          </span>
          <span className="dark-check__value">{span(tolerance)}</span>
        </div>
      )}
      <p className="panel__note">{t('dark.note')}</p>
    </div>
  )
}

const FIELDS: { key: keyof LanderDraft; label: BatteryKey; unit: BatteryKey; min: number }[] = [
  { key: 'panel', label: 'charge.panel', unit: 'charge.w', min: 0 },
  { key: 'load', label: 'charge.load', unit: 'charge.w', min: 0.1 },
  { key: 'battery', label: 'charge.battery', unit: 'charge.wh', min: 1 },
]

function ChargeSummary({ data, sunlitHours }: { data: EnergyResult; sunlitHours: number }) {
  const { t, formatSpan, formatPercent, formatDateTime } = useI18n()
  const span = (hours: number) => formatSpan(hours * HOUR_MS)
  const at = formatDateTime(Date.parse(data.min_charge_t))
  const pointed = data.lander.panel_pointing !== undefined && data.lander.panel_pointing !== 'sun' && data.panel_lit_hours !== undefined
  return (
    <>
      <p className="charge__say" aria-live="polite">
        {data.load_always_met
          ? withValues(t('charge.always'), { min: formatPercent(data.min_charge_fraction), date: at })
          : withValues(t('charge.unmet'), { unmet: span(data.unmet_hours), date: at })}
      </p>
      {pointed && (
        <p className="charge__say charge__effect">{withValues(t('panels.effect'), { sunlit: span(sunlitHours), lit: span(data.panel_lit_hours ?? 0) })}</p>
      )}
      <table className="metrics">
        <caption className="visually-hidden">{t('charge.caption')}</caption>
        <tbody>
          <tr>
            <th scope="row">{t('charge.min')}</th>
            <td>{formatPercent(data.min_charge_fraction)}</td>
          </tr>
          <tr>
            <th scope="row">{t('charge.when')}</th>
            <td>{at}</td>
          </tr>
          <tr>
            <th scope="row">{t('charge.unmetRow')}</th>
            <td>{data.unmet_hours === 0 ? t('charge.none') : span(data.unmet_hours)}</td>
          </tr>
          <tr>
            <th scope="row">{t('charge.final')}</th>
            <td>{formatPercent(data.final_charge_fraction)}</td>
          </tr>
          <tr>
            <th scope="row">{t('charge.tolerance')}</th>
            <td>{span(data.darkness_tolerance_hours)}</td>
          </tr>
          <tr>
            <th scope="row">{t('charge.lcsp')}</th>
            <td>{span(data.lcsp_hours)}</td>
          </tr>
          {pointed && data.panel_longest_dark_hours !== undefined && (
            <tr>
              <th scope="row">{t('charge.panelsDark')}</th>
              <td>{span(data.panel_longest_dark_hours)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

/**
 * Where the panels face (the requirement): always toward the Sun, upright and fixed toward an azimuth the
 * user types, or lying flat. The azimuth keeps what was typed when another choice is picked.
 */
export function PanelsChoice({ panels, onPanels }: { panels: PanelsDraft; onPanels: (panels: PanelsDraft) => void }) {
  const { t } = useI18n()
  const id = useId()
  const [lastAzimuth, setLastAzimuth] = useState(panels.pointing === 'fixed' ? panels.azimuth : '90')
  const azimuth = panels.pointing === 'fixed' ? panels.azimuth : lastAzimuth
  const setAzimuth = (value: string) => {
    setLastAzimuth(value)
    onPanels({ pointing: 'fixed', azimuth: value })
  }
  return (
    <fieldset className="panels-choice">
      <legend>{t('panels.legend')}</legend>
      <label className="panels-choice__option">
        <input type="radio" name={id} checked={panels.pointing === 'sun'} onChange={() => onPanels({ pointing: 'sun' })} />
        {t('panels.sun')}
      </label>
      <span className="panels-choice__option">
        <input
          id={`${id}-fixed`}
          type="radio"
          name={id}
          checked={panels.pointing === 'fixed'}
          onChange={() => onPanels({ pointing: 'fixed', azimuth })}
        />
        <label htmlFor={`${id}-fixed`}>{t('panels.fixed')}</label>
        <span className="battery-field__input panels-choice__azimuth">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={359.9}
            step="any"
            value={azimuth}
            aria-label={t('panels.azimuth')}
            aria-describedby={`${id}-hint`}
            onFocus={() => {
              if (panels.pointing !== 'fixed') onPanels({ pointing: 'fixed', azimuth })
            }}
            onChange={(event) => setAzimuth(event.target.value)}
          />
          <span aria-hidden="true">{t('panels.degrees')}</span>
        </span>
      </span>
      <p id={`${id}-hint`} className="battery-field__hint panels-choice__hint">
        {t('panels.azimuthHint')}
      </p>
      <label className="panels-choice__option">
        <input type="radio" name={id} checked={panels.pointing === 'flat'} onChange={() => onPanels({ pointing: 'flat' })} />
        {t('panels.flat')}
      </label>
    </fieldset>
  )
}

/**
 * The full reading: three numbers describe a lander, and the backend follows its Charge across the
 * Window. The Charge itself is drawn on the time strip (`ChargeRow`); this is the sentence and the numbers.
 */
export function ChargePanel({
  draft,
  onDraft,
  panels,
  onPanels,
  sunlitHours,
  energy,
  onRetry,
}: {
  draft: LanderDraft
  onDraft: (draft: LanderDraft) => void
  panels: PanelsDraft
  onPanels: (panels: PanelsDraft) => void
  /** The Window's sunlit hours, from `/visibility`, for the sentence on what the pointing costs. */
  sunlitHours: number
  energy: EnergyState
  onRetry: () => void
}) {
  const { t } = useI18n()
  const id = useId()
  // The three numbers are there and only the azimuth is missing: say that, not "type the three numbers".
  const idle = landerOf(draft) !== null && panels.pointing === 'fixed' ? 'charge.idleAzimuth' : 'charge.idle'
  return (
    <div className="charge">
      <p className="charge__example">
        <span className="charge__exampleName">{t('charge.example')}</span>
        <button type="button" className="charge__preset" aria-pressed={sameDraft(draft, VIPER)} onClick={() => onDraft(VIPER)}>
          {t('charge.exampleViper')}
        </button>
      </p>
      {sameDraft(draft, VIPER) && <p className="panel__note charge__source">{t('charge.exampleSource')}</p>}
      <div className="charge__fields">
        {FIELDS.map((field) => (
          <div key={field.key} className="battery-field">
            <label htmlFor={`${id}-${field.key}`}>{t(field.label)}</label>
            <span className="battery-field__input">
              <input
                id={`${id}-${field.key}`}
                type="number"
                inputMode="decimal"
                min={field.min}
                value={draft[field.key]}
                onChange={(event) => onDraft({ ...draft, [field.key]: event.target.value })}
              />
              <span aria-hidden="true">{t(field.unit)}</span>
            </span>
          </div>
        ))}
      </div>
      <PanelsChoice panels={panels} onPanels={onPanels} />
      {energy.status === 'idle' && <p className="panel__status">{t(idle)}</p>}
      {energy.status === 'loading' && (
        <p className="panel__status" role="status">
          {t('charge.loading')}
        </p>
      )}
      {energy.status === 'error' && <PanelStatus code={energy.code} onRetry={onRetry} />}
      {energy.status === 'ready' && <ChargeSummary data={energy.data} sunlitHours={sunlitHours} />}
      {energy.status === 'ready' && energy.data.charge_fraction.some((value) => value === 0) && (
        <p className="panel__note">{t('charge.empty')}</p>
      )}
      <p className="panel__note">{t('charge.note')}</p>
      <p className="panel__note">{t('panels.source')}</p>
    </div>
  )
}

/**
 * The Charge as a row of the time strip, under the Earth: the same time axis and the same Cursor as
 * the Sun and Earth rows. Built to sit inside `.strip__track`, with the strip's label column.
 */
export function ChargeRow({
  data,
  startMs,
  endMs,
  name,
  aside,
}: {
  data: EnergyResult
  startMs: number
  endMs: number
  /** The row's label; the Charge by default. */
  name?: ReactNode
  /** A reading beside the row, in the strip's right-hand column after a landing. */
  aside?: ReactNode
}) {
  const { t, formatPercent } = useI18n()
  const values = data.charge_fraction
  const stepMs = data.step_minutes * 60_000
  const x = (index: number) => Math.min(100, ((index * stepMs) / (endMs - startMs)) * 100)
  const line = values.map((value, index) => `${x(index).toFixed(3)},${((1 - value) * 100).toFixed(2)}`).join(' ')
  const area = `0,100 ${line} ${x(values.length - 1).toFixed(3)},100`
  // Where the battery is empty: the same hatch the strip uses for a Short shadow, so it reads as a gap.
  const empty: { left: number; width: number }[] = []
  values.forEach((value, index) => {
    if (value > 0) return
    const last = empty[empty.length - 1]
    if (last && Math.abs(last.left + last.width - x(index - 1)) < 1e-6) last.width = x(index) - last.left
    else empty.push({ left: x(Math.max(0, index - 1)), width: x(index) - x(Math.max(0, index - 1)) })
  })
  return (
    <div className="strip__row charge-row" role="img" aria-label={t('charge.rowLabel', { min: formatPercent(data.min_charge_fraction) })}>
      <span className="strip__name">{name ?? t('charge.row')}</span>
      <div className="charge-row__plot">
        {empty.map((band, index) => (
          <i key={index} className="charge-row__empty" style={{ left: `${band.left}%`, width: `${band.width}%` }} />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon className="charge-row__area" points={area} />
          <polyline className="charge-row__line" points={line} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {aside}
    </div>
  )
}

/**
 * The battery as it sits under the answer: the title, the simple reading always open, and the full
 * reading behind a button, the way the Resolution ladder opens.
 */
export function BatterySection({ open, onOpen, children }: { open: boolean; onOpen: (open: boolean) => void; children: [ReactNode, ReactNode] }) {
  const { t } = useI18n()
  const body = useId()
  const [simple, full] = children
  return (
    <section className="battery">
      <h3 className="battery__title">{t('battery.title')}</h3>
      {simple}
      <div className="panel">
        <button type="button" className="panel__open" aria-expanded={open} aria-controls={body} onClick={() => onOpen(!open)}>
          {t('charge.open')}
        </button>
        {open && (
          <div id={body} className="panel__body">
            {full}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * What the Darkness tolerance is read against once the panels do not face the Sun: the answer's
 * longest stretch with no light on them. Null while there is no such answer, or the panels face the
 * Sun; the simple reading then stays on the LCSP.
 */
export function panelsDarkHours(state: EnergyState): number | null {
  if (state.status !== 'ready') return null
  const { lander, panel_longest_dark_hours: hours } = state.data
  return lander.panel_pointing !== undefined && lander.panel_pointing !== 'sun' && hours !== undefined ? hours : null
}

/**
 * The battery under the answer: the simple reading against the Window's LCSP, and the full reading
 * behind a button. Every field and the open state live in the link.
 */
export function Battery({ result }: { result: VisibilityResult }) {
  const settings = useBatterySettings()
  const { state, retry } = useEnergy(result.query, settings.draft, settings.panels, settings.open)
  return (
    <BatterySection open={settings.open} onOpen={(open) => updateSettings({ open })}>
      <DarknessCheck
        lcspHours={result.metrics.lcsp_hours}
        panelsDarkHours={panelsDarkHours(state)}
        tolerance={settings.tolerance}
        onTolerance={(tolerance) => updateSettings({ tolerance })}
      />
      <ChargePanel
        draft={settings.draft}
        onDraft={(draft) => updateSettings({ draft })}
        panels={settings.panels}
        onPanels={(panels) => updateSettings({ panels })}
        sunlitHours={result.metrics.sunlit_hours}
        energy={state}
        onRetry={retry}
      />
    </BatterySection>
  )
}

/**
 * The Charge as a row of the time strip, once the full reading has an answer. It sits in the strip's
 * track, so it shares the Window's axis and the Cursor.
 */
export function ChargeStrip({ result }: { result: VisibilityResult }) {
  const settings = useBatterySettings()
  const { state } = useEnergy(result.query, settings.draft, settings.panels, settings.open)
  if (state.status !== 'ready') return null
  return <ChargeRow data={state.data} startMs={Date.parse(result.query.start)} endMs={Date.parse(result.query.end)} />
}
