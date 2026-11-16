import '@fontsource/orbitron/latin-600.css'
import { useId, useMemo, useState, type JSX } from 'react'
import type { VisibilityResult } from '../../api/client'
import { useI18n } from '../../i18n/I18nContext'
import type { MessageKey } from '../../i18n/messages'
import { useUncertainty } from '../../hooks/useUncertainty'
import type { Body } from '../../domain/statement'
import { BodyStatement, summaryKey } from '../Answer'
import { coordinate } from '../siteName'
import type { Vehicle } from '../vehiclePicker/vehicles'
import { currentRow, durationParts, oneDecimal, periodRows, sectionsOf, summarise, type PanelVariant, type PeriodRow } from './panelData'
import type { en } from './panelStrings'
import { BatteryGauge } from './BatteryGauge'
import './landingPanel.css'

type PanelKey = keyof typeof en

const HOUR_MS = 3_600_000

export interface LandingPanelProps {
  result: VisibilityResult // the /visibility answer for the landing Site and Window
  siteName: string
  /**
   * 'vehicle' is the panel of a Level 2 landing, with the vehicle and its energy periods. 'site' is the one
   * for every place without a vehicle (Level 1, and the maps before a landing): only what exists there.
   */
  variant: PanelVariant
  vehicle: Vehicle | null // chosen before landing; only the 'vehicle' panel shows it
  cursorMs: number
  onCursor: (ms: number) => void
  /** Whose Occluder is marked on the horizon, and the way to mark one (the reason under a Countdown). */
  marked?: Body | null
  onMark?: (body: Body) => void
  /** The next Site is being asked for: the last answer stays, dimmed. */
  stale?: boolean
}

/** The Countdowns of the Cursor: the sentence about the Sun and the one about the Earth, each with its Occluder and the DEM band. */
function Countdowns({ result, cursorMs, marked, onMark, label }: { result: VisibilityResult; cursorMs: number; marked: Body | null; onMark?: (body: Body) => void; label: string }) {
  // Asked once the answer is here, and never waited for.
  const uncertainty = useUncertainty(result)
  return (
    <section className="landing-panel__card landing-panel__countdown" aria-label={label}>
      <BodyStatement body="sun" result={result} cursorMs={cursorMs} heading="h3" marked={marked === 'sun'} onMark={onMark} uncertainty={uncertainty} measured={false} />
      <BodyStatement body="earth" result={result} cursorMs={cursorMs} heading="h3" marked={marked === 'earth'} onMark={onMark} uncertainty={uncertainty} measured={false} />
    </section>
  )
}

const STORAGE_KEY = 'landingPanel.collapsed'
// The same width as the phone rule in landingPanel.css: below it the panel starts closed.
const PHONE = '(max-width: 560px)'

/** The remembered choice, else closed on a phone so the view from the ground stays in sight. */
function initialCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === '1') return true
    if (stored === '0') return false
  } catch {
    // Storage blocked (private window, settings): fall through to the default.
  }
  try {
    return window.matchMedia(PHONE).matches
  } catch {
    return false
  }
}

function remember(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Not remembered this time; the panel still works.
  }
}

interface ListProps {
  rows: PeriodRow[]
  cursorMs: number
  onLabel: string
  offLabel: string
  kind: 'sun' | 'earth'
  span: (row: PeriodRow) => string
  duration: (ms: number) => string
  onCursor: (ms: number) => void
}

function PeriodList({ rows, cursorMs, onLabel, offLabel, kind, span, duration, onCursor }: ListProps) {
  const current = currentRow(rows, cursorMs)
  return (
    <ul className="landing-panel__periods">
      {rows.map((row, index) => (
        <li key={row.start}>
          <button
            type="button"
            className="landing-panel__period"
            aria-current={index === current ? 'true' : undefined}
            onClick={() => onCursor(row.start)}
          >
            <span className={`landing-panel__tag landing-panel__tag--${row.visible ? kind : 'off'}`}>{row.visible ? onLabel : offLabel}</span>
            <span className="landing-panel__dur">{duration(row.end - row.start)}</span>
            <span className="landing-panel__span">{span(row)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function LandingPanel({ result, siteName, variant, vehicle, cursorMs, onCursor, marked = null, onMark, stale = false }: LandingPanelProps): JSX.Element {
  const i18n = useI18n()
  const { formatNumber, formatDate, formatDay, formatTime, formatPercent } = i18n
  // The keys reach MessageKey once messages.ts spreads panelStrings; until then the cast bridges them.
  const t = (key: PanelKey, params?: Record<string, string>) => i18n.t(key as string as MessageKey, params)
  const panelId = useId()
  const titleId = useId()
  const hintId = useId()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const sections = sectionsOf(variant)
  const has = (section: (typeof sections)[number]) => sections.includes(section)

  const startMs = Date.parse(result.query.start)
  const endMs = Date.parse(result.query.end)
  const summary = useMemo(() => summarise(result), [result])
  const energy = useMemo(() => periodRows(result.periods, 'sun', startMs, endMs), [result.periods, startMs, endMs])
  const comms = useMemo(() => periodRows(result.periods, 'earth', startMs, endMs), [result.periods, startMs, endMs])

  const duration = (ms: number) => {
    const { hours, days } = durationParts(ms)
    if (days === null) return t('landingPanel.hours', { hours: oneDecimal(hours, formatNumber) })
    return t('landingPanel.hoursDays', { hours: formatNumber(hours), days: oneDecimal(days, formatNumber) })
  }
  const share = (ms: number) =>
    t('landingPanel.share', { duration: duration(ms), percent: formatPercent(summary.windowMs > 0 ? ms / summary.windowMs : 0) })
  const instant = (ms: number) => `${formatDay(ms)} ${formatTime(ms)}`
  const span = (row: PeriodRow) => t('landingPanel.span', { start: instant(row.start), end: instant(row.end) })
  const windowText = t('landingPanel.window', {
    start: `${formatDate(startMs)}, ${formatTime(startMs)}`,
    end: `${formatDate(endMs)}, ${formatTime(endMs)}`,
  })

  const toggle = () => {
    const next = !collapsed
    remember(next)
    setCollapsed(next)
  }

  return (
    <div className="landing-panel" data-collapsed={collapsed} data-variant={variant} data-stale={stale}>
      <button
        type="button"
        className="landing-panel__toggle"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        aria-label={t(collapsed ? 'landingPanel.show' : 'landingPanel.hide')}
        onClick={toggle}
      >
        <span aria-hidden="true">{collapsed ? '‹' : '›'}</span>
      </button>
      <aside id={panelId} className="landing-panel__body" aria-labelledby={titleId}>
        <header>
          {has('vehicle') && vehicle && <BatteryGauge result={result} vehicle={vehicle} cursorMs={cursorMs} />}
          <h2 id={titleId} className="landing-panel__title">
            <span className="visually-hidden">{t('landingPanel.label')}: </span>
            {siteName}
          </h2>
          <p className="landing-panel__sub">
            {coordinate(result.query.site, i18n)}
            {has('vehicle') && vehicle && (
              <>
                <br />
                {t('landingPanel.vehicle', { name: vehicle.name })}
              </>
            )}
            <br />
            {windowText}
          </p>
        </header>

        {has('countdown') && <Countdowns result={result} cursorMs={cursorMs} marked={marked} onMark={onMark} label={t('landingPanel.countdown')} />}

        {has('sentence') && (
          <p className="landing-panel__sentence">
            {i18n.t(summaryKey(result.metrics), {
              both: i18n.formatSpan(result.metrics.sun_and_earth_hours * HOUR_MS),
              lit: i18n.formatSpan(result.metrics.lcip_hours * HOUR_MS),
              dark: i18n.formatSpan(result.metrics.lcsp_hours * HOUR_MS),
            })}
          </p>
        )}

        <section className="landing-panel__card">
          <h3>{t('landingPanel.summary')}</h3>
          <dl className="landing-panel__kv">
            <dt>
              <span className="landing-panel__dot landing-panel__dot--sun" aria-hidden="true" />
              {t('landingPanel.sun')}
            </dt>
            <dd>{share(summary.sunMs)}</dd>
            <dt>
              <span className="landing-panel__dot landing-panel__dot--earth" aria-hidden="true" />
              {t('landingPanel.earth')}
            </dt>
            <dd>{share(summary.earthMs)}</dd>
            <dt>
              <span className="landing-panel__dot landing-panel__dot--both" aria-hidden="true" />
              {t('landingPanel.both')}
            </dt>
            <dd>{share(summary.bothMs)}</dd>
            <dt>{t('landingPanel.longestNight')}</dt>
            <dd>{duration(summary.longestNightMs)}</dd>
            <dt>{t('landingPanel.longestNoEarth')}</dt>
            <dd>{duration(summary.longestNoEarthMs)}</dd>
          </dl>
        </section>

        {has('hint') && (
          <p id={hintId} className="landing-panel__note">
            {t('landingPanel.hint')}
          </p>
        )}

        {has('energy') && (
          <section className="landing-panel__card" aria-describedby={hintId}>
            <h3>{t('landingPanel.energy')}</h3>
            <PeriodList
              rows={energy}
              cursorMs={cursorMs}
              onLabel={t('landingPanel.charge')}
              offLabel={t('landingPanel.battery')}
              kind="sun"
              span={span}
              duration={duration}
              onCursor={onCursor}
            />
          </section>
        )}

        {has('comms') && (
          <section className="landing-panel__card" aria-describedby={hintId}>
            <h3>{t('landingPanel.comms')}</h3>
            <PeriodList
              rows={comms}
              cursorMs={cursorMs}
              onLabel={t('landingPanel.link')}
              offLabel={t('landingPanel.noLink')}
              kind="earth"
              span={span}
              duration={duration}
              onCursor={onCursor}
            />
          </section>
        )}

        <p className="landing-panel__note">{t(variant === 'vehicle' ? 'landingPanel.note' : 'landingPanel.noteSite')}</p>
      </aside>
    </div>
  )
}
