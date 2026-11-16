import { AmericanDateInput } from '../../vehiclePicker/AmericanDateInput'
import { useMemo } from 'react'
import type { Site, VisibilityResult } from '../../../api/client'
import { comparePlans, METRIC_KEYS, TIE_HOURS, TIE_SHARE, type Plan, type Row, type Side } from '../../../domain/planCompare'
import {
  HEIGHT_MAX_M,
  HEIGHT_MIN_M,
  isCoordinate,
  maxDays,
  siteKey,
  siteRefOf,
  startDayRange,
  utcDay,
  type PlanBLink,
  type Query,
  type SiteRef,
} from '../../../domain/query'
import { useSites } from '../../../hooks/useAnswer'
import { useI18n } from '../../../i18n/I18nContext'
import type { MessageKey } from '../../../i18n/messages'
import { PanelStatus } from '../../PanelStatus'
import { SitePicker } from '../../SitePicker'
import { siteName } from '../../siteName'
import { NumberField } from '../../Where'
import { span, usePanelText } from '../site-windows/text'
import { useCoverage, usePlanB, usePlanBLink } from './api'
import { planSentence } from './sentence'
import { en, pt } from './strings'
import './planCompare.css'

type Text = ReturnType<typeof usePanelText<keyof typeof en>>

const EMPTY_PLAN_B: PlanBLink = { site: null, startDay: null, hours: null, heightM: null }

const METRIC_LABELS: Record<(typeof METRIC_KEYS)[number], MessageKey> = {
  sun_and_earth_hours: 'metric.both',
  sunlit_hours: 'metric.sun',
  earth_visible_hours: 'metric.earth',
  lcip_hours: 'metric.lcip',
  lcsp_hours: 'metric.lcsp',
  mean_sun_fraction: 'metric.fraction',
}

/** The three totals also show their share of the Window, so two Windows of different length can be read. */
const TOTALS = new Set<string>(['sun_and_earth_hours', 'sunlit_hours', 'earth_visible_hours'])

function planOf(result: VisibilityResult): Plan {
  return { metrics: result.metrics, durationHours: result.query.duration_hours }
}

function queryOf(result: VisibilityResult): Query {
  const { site, start, duration_hours: durationHours, observer_height_m: observerHeightM } = result.query
  return { site: siteRefOf(site), start: new Date(start), durationHours, observerHeightM }
}

/** The Site the picker shows for a Plan B Query: the Curated Site from the list, or the typed coordinate. */
function pickerSite(ref: SiteRef, sites: readonly Site[], named: (site: Site) => string): Site {
  const base = { source_reference: '', region_id: null, curated: false, has_5m_dem: false } as const
  if (isCoordinate(ref)) {
    const custom: Site = { ...base, id: 'custom', name: '', latitude_deg: ref.latitudeDeg, longitude_deg: ref.longitudeDeg, source: 'custom' }
    return { ...custom, name: named(custom) }
  }
  // Until the list arrives the picker shows the code, which is still the Site the Query asks about.
  return sites.find((site) => site.id === ref) ?? { ...base, id: ref, name: ref, latitude_deg: 0, longitude_deg: 0, source: 'wueller2026' }
}

function valueText(text: Text, row: Row, side: Side): string {
  const value = side === 'a' ? row.a : row.b
  return row.metric === 'mean_sun_fraction' ? text.formatPercent(value) : span(text, value)
}

function Mark({ text, row, side }: { text: Text; row: Row; side: Side }) {
  if (row.better === 'tie') {
    return (
      <>
        <span aria-hidden="true" className="plan-compare__mark">
          {' ='}
        </span>
        <span className="visually-hidden"> {text.t('tie')}</span>
      </>
    )
  }
  if (row.better !== side) return null
  return (
    <>
      <span aria-hidden="true" className="plan-compare__mark">
        {' ★'}
      </span>
      <span className="visually-hidden"> {text.t('better')}</span>
    </>
  )
}

function Table({ a, b, text }: { a: VisibilityResult; b: VisibilityResult; text: Text }) {
  const i18n = useI18n()
  const comparison = useMemo(() => comparePlans(planOf(a), planOf(b)), [a, b])
  const { formatNumber, formatPercent } = text
  const say = {
    t: text.t,
    gap: (row: Row) =>
      row.unit === 'hours' ? span(text, row.gap) : text.t('gap.points', { value: formatNumber(Math.round(row.gap * 1000) / 10) }),
  }
  const heading = (side: Side, result: VisibilityResult) => (
    <th scope="col" className="plan-compare__plan">
      {text.t(side === 'a' ? 'plan.a' : 'plan.b')}
      <span className="plan-compare__where">{siteName(result.query.site, i18n)}</span>
    </th>
  )
  const share = (row: Row, side: Side, result: VisibilityResult) =>
    TOTALS.has(row.metric) ? (
      <span className="plan-compare__share">{formatPercent((side === 'a' ? row.a : row.b) / result.query.duration_hours)}</span>
    ) : null
  return (
    <>
      <p className="plan-compare__say" aria-live="polite">
        {planSentence(comparison.summary, say)}
      </p>
      <table className="metrics plan-compare__table">
        <caption className="visually-hidden">{text.t('caption')}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{text.t('col.number')}</span>
            </th>
            {heading('a', a)}
            {heading('b', b)}
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.metric}>
              <th scope="row">{i18n.t(METRIC_LABELS[row.metric])}</th>
              {(['a', 'b'] as const).map((side) => (
                <td key={side} className={row.better === side ? 'plan-compare__best' : undefined}>
                  <span>
                    {valueText(text, row, side)}
                    <Mark text={text} row={row} side={side} />
                  </span>{' '}
                  {share(row, side, side === 'a' ? a : b)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="panel__note">{text.t('legend', { hours: formatNumber(TIE_HOURS), points: formatNumber(TIE_SHARE * 100) })}</p>
      {!comparison.sameLength && <p className="panel__note">{text.t('note.length')}</p>}
    </>
  )
}

/** Plan B's Site, Window and Observer height, as fields. What it leaves alone stays as in Plan A. */
function PlanBFields({ planA, query, link, onLink, text }: { planA: Query; query: Query; link: PlanBLink; onLink: (link: PlanBLink) => void; text: Text }) {
  const i18n = useI18n()
  const sites = useSites()
  const coverage = useCoverage()
  const startMs = query.start.getTime()
  const range = coverage ? startDayRange(coverage, query.durationHours) : null
  const days = Math.round((query.durationHours / 24) * 10) / 10

  // A value equal to Plan A's goes back to null, so Plan B keeps following Plan A and the link stays short.
  const change = (patch: Partial<PlanBLink>) => {
    const next = { ...link, ...patch }
    if (next.site !== null && siteKey(next.site) === siteKey(planA.site)) next.site = null
    if (next.startDay === utcDay(planA.start.getTime())) next.startDay = null
    if (next.hours !== null && Math.abs(next.hours - planA.durationHours) < 1e-6) next.hours = null
    if (next.heightM !== null && next.heightM === planA.observerHeightM) next.heightM = null
    onLink(next)
  }

  return (
    <div className="where plan-compare__fields">
      <strong className="plan-compare__b">{text.t('plan.b')}</strong>
      <SitePicker
        sites={sites}
        site={pickerSite(query.site, sites, (site) => siteName(site, i18n))}
        maxLatitudeDeg={coverage?.custom_max_latitude_deg ?? -80}
        onSite={(id) => change({ site: id })}
        onCoordinate={(coordinate) => change({ site: coordinate })}
      />
      <span>
        <AmericanDateInput
          className="site where__date"
          withTime={false}
          aria-label={text.t('b.start')}
          min={range?.min}
          max={range?.max}
          value={utcDay(startMs)}
          onChange={(day) => {
            if (day && (!range || (day >= range.min && day <= range.max))) change({ startDay: day })
          }}
        />{' '}
        {text.t('b.for')}{' '}
        <NumberField
          key={`days-${days}`}
          value={days}
          min={1}
          max={coverage ? maxDays(coverage) : 60}
          step={0.5}
          label={text.t('b.days')}
          onCommit={(value) => {
            // A longer Window must still end inside the coverage: pull the start back if it would not.
            const hours = value * 24
            const latest = coverage ? startDayRange(coverage, hours).max : null
            change({ hours, ...(latest && utcDay(startMs) > latest ? { startDay: latest } : {}) })
          }}
        />
        {text.t('b.daysUnit')}
      </span>
      <span>
        {text.t('b.heightBefore')}{' '}
        <NumberField
          key={`height-${query.observerHeightM}`}
          value={query.observerHeightM}
          min={HEIGHT_MIN_M}
          max={HEIGHT_MAX_M}
          step={0.5}
          label={text.t('b.height')}
          onCommit={(heightM) => change({ heightM })}
        />
        {text.t('b.heightUnit')}
      </span>
    </div>
  )
}

function Body({ result, link, onLink, text }: { result: VisibilityResult; link: PlanBLink; onLink: (link: PlanBLink) => void; text: Text }) {
  const planA = useMemo(() => queryOf(result), [result])
  const { query, same, state, retry } = usePlanB(planA, link)
  return (
    <div className="panel__body">
      <h3 className="plan-compare__title">{text.t('title')}</h3>
      <p className="panel__note">{text.t('intro')}</p>
      <PlanBFields planA={planA} query={query} link={link} onLink={onLink} text={text} />
      {same && <p className="panel__note plan-compare__same">{text.t('same')}</p>}
      {!same && (state.status === 'loading' || state.status === 'idle') && (
        <p className="panel__status" role="status">
          {text.t('loading')}
        </p>
      )}
      {!same && state.status === 'error' && <PanelStatus code={state.code} onRetry={retry} />}
      {!same && state.status === 'ready' && <Table a={result} b={state.data} text={text} />}
    </div>
  )
}

/**
 * Plan A × Plan B: the Query on screen against a second one, number by number, under the answer.
 * Plan B lives in the link (`compare`, `bsite`, `blat`, `blon`, `bstart`, `bhours`, `bheight`), so a
 * copied link reopens both plans. Both answers come from the `/visibility` the page already uses.
 */
export function PlanCompare({ result }: { result: VisibilityResult }) {
  const text = usePanelText({ en, pt })
  const [link, setLink] = usePlanBLink()
  const open = link !== null
  return (
    <section className="panel plan-compare" aria-label={text.t('title')}>
      <button type="button" className="panel__open" aria-expanded={open} onClick={() => setLink(open ? null : EMPTY_PLAN_B)}>
        {text.t('open')}
      </button>
      {open && <Body result={result} link={link} onLink={setLink} text={text} />}
    </section>
  )
}
