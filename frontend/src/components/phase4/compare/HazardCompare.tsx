import { useState, type ReactNode } from 'react'
import type { Site } from '../../../api/client'
import { isCoordinate, siteKey, siteRefOf, type SiteRef } from '../../../domain/query'
import { useOnDemand } from '../../../hooks/useLadder'
import { useSites } from '../../../hooks/useAnswer'
import { useI18n } from '../../../i18n/I18nContext'
import { getSiteHazard } from '../../hazard/uncertainty/hazardApi'
import { shareText } from '../../hazard/uncertainty/shareLogic'
import { PanelStatus } from '../../PanelStatus'
import { siteName } from '../../siteName'
import { usePanelText } from '../site-windows/text'
import { changeText, DEFAULT_LEVEL, degrees, intervalText, LEVELS, relativeChange, runSentence, siteView, type Interval, type Level, type RunView } from './hazardLogic'
import { en, pt } from './hazardStrings'
import './hazardCompare.css'

type Text = ReturnType<typeof usePanelText<keyof typeof en>>

/** A Monte Carlo mean, with its 95% interval under it when the interval reads as more than one value. */
function Value({ interval, text }: { interval: Interval; text: Text }) {
  const { value, range } = intervalText(interval, (fraction) => shareText(fraction, text.formatPercent))
  return (
    <>
      <span>{value}</span>
      {range && <span className="hazard-compare__range"> ({range})</span>}
    </>
  )
}

function Plain({ children }: { children: string }) {
  return <span>{children}</span>
}

function Row({ label, normal, multiresolution, change }: { label: string; normal: ReactNode; multiresolution: ReactNode; change: string | null }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{normal}</td>
      <td>{multiresolution}</td>
      <td className="hazard-compare__change">{change ?? '–'}</td>
    </tr>
  )
}

function RunTable({ view, level, plan, slopeLimitDeg, text }: { view: RunView; level: Level; plan: string; slopeLimitDeg: number; text: Text }) {
  const { formatPercent, formatNumber } = text
  const percent = (fraction: number) => shareText(fraction, formatPercent)
  const change = (from: number, to: number) => changeText(relativeChange(from, to), formatPercent)
  const { normal, multiresolution, fair, medianError } = view
  return (
    <section className="hazard-compare__run">
      <h5 className="hazard-compare__grid">{text.t('grid.title', { coarse: String(view.coarseM) })}</h5>
      <p className="plan-compare__say">{runSentence(view, level, slopeLimitDeg, text)}</p>
      <table className="metrics hazard-compare__table">
        <caption className="visually-hidden">{text.t('caption', { plan, coarse: String(view.coarseM) })}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{text.t('col.number')}</span>
            </th>
            <th scope="col">{text.t('col.normal')}</th>
            <th scope="col">{text.t('col.multiresolution', { level })}</th>
            <th scope="col">{text.t('col.change')}</th>
          </tr>
        </thead>
        <tbody>
          <Row
            label={text.t('row.hazard')}
            normal={<Value interval={normal.missed_hazard} text={text} />}
            multiresolution={<Value interval={multiresolution.missed_hazard} text={text} />}
            change={change(normal.missed_hazard.mean, multiresolution.missed_hazard.mean)}
          />
          <Row
            label={text.t('row.falseAlarm')}
            normal={<Value interval={normal.false_alarm} text={text} />}
            multiresolution={<Value interval={multiresolution.false_alarm} text={text} />}
            change={change(normal.false_alarm.mean, multiresolution.false_alarm.mean)}
          />
          {fair && (
            <Row
              label={text.t('row.fair', { falseAlarm: percent(fair.falseAlarm) })}
              normal={<Plain>{percent(fair.normal)}</Plain>}
              multiresolution={<Plain>{percent(fair.multiresolution)}</Plain>}
              change={change(fair.normal, fair.multiresolution)}
            />
          )}
          <Row
            label={text.t('row.error')}
            normal={<Plain>{degrees(medianError.normal, formatNumber)}</Plain>}
            multiresolution={<Plain>{degrees(medianError.multiresolution, formatNumber)}</Plain>}
            change={change(medianError.normal, medianError.multiresolution)}
          />
        </tbody>
      </table>
    </section>
  )
}

/** One Site's numbers, from the 60 m grid and from the 20 m grid, or why there are none. */
function SiteBlock({ heading, plan, site, name, level, text }: { heading: string; plan: string; site: SiteRef; name: string; level: Level; text: Text }) {
  const siteId = isCoordinate(site) ? null : site
  const { state, retry } = useOnDemand(siteId !== null, siteId ?? '', () => getSiteHazard(siteId ?? ''))
  const view = state.status === 'ready' ? siteView(state.data, level) : null
  return (
    <div className="hazard-compare__site">
      <h4 className="hazard-compare__heading">{heading}</h4>
      {siteId === null && <p className="panel__note">{text.t('custom')}</p>}
      {siteId !== null && state.status === 'loading' && (
        <p className="panel__status" role="status">
          {text.t('loading')}
        </p>
      )}
      {state.status === 'error' && <PanelStatus code={state.code} onRetry={retry} />}
      {view?.kind === 'noGrid' && <p className="panel__note">{text.t('noGrid', { site: name })}</p>}
      {view?.kind === 'grid' && state.status === 'ready' && (
        <>
          <p className="panel__note">{text.t('grid.note', { grid: view.gridId, distance: text.formatNumber(view.distanceKm) })}</p>
          {view.runs.map((run) => (
            <RunTable key={run.coarseM} view={run} level={level} plan={plan} slopeLimitDeg={view.slopeLimitDeg} text={text} />
          ))}
          <p className="panel__note">{text.t('legend', { limit: String(view.slopeLimitDeg) })}</p>
        </>
      )}
    </div>
  )
}

/**
 * Under the Plan A x Plan B table: for the Site of each plan, how much of the steep ground Normal
 * navigation and Multiresolution each call safe by mistake, the fair reading at the same false
 * alarm next to the nominal one, and the median error, from the 60 m and the 20 m grid. Every
 * number is the API's (`GET /sites/{id}/hazard`); the browser only formats them and shows the
 * change from one to the other. They belong to the grid nearest each Site, which the block says.
 */
export function HazardCompare({ siteA, siteB }: { siteA: Site; siteB: SiteRef }) {
  const i18n = useI18n()
  const text = usePanelText({ en, pt })
  const sites = useSites()
  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL)
  const refA = siteRefOf(siteA)
  const nameA = siteName(siteA, i18n)
  const nameB = isCoordinate(siteB) ? '' : (sites.find((site) => site.id === siteB)?.name ?? siteB)
  const same = siteKey(refA) === siteKey(siteB)
  return (
    <section className="hazard-compare" aria-label={text.t('title')}>
      <h3 className="plan-compare__title">{text.t('title')}</h3>
      <p className="panel__note">{text.t('intro')}</p>
      <fieldset className="hazard-compare__levels">
        <legend>{text.t('level.label')}</legend>
        {LEVELS.map((option) => (
          <label key={option} className="hazard-compare__level">
            <input type="radio" name="hazard-level" value={option} checked={level === option} onChange={() => setLevel(option)} /> {option}
          </label>
        ))}
      </fieldset>
      <p className="panel__note">{text.t('note.fair')}</p>
      {same ? (
        <SiteBlock heading={text.t('plan.both', { site: nameA })} plan={text.t('plan.a')} site={refA} name={nameA} level={level} text={text} />
      ) : (
        <>
          <SiteBlock heading={text.t('plan.one', { plan: text.t('plan.a'), site: nameA })} plan={text.t('plan.a')} site={refA} name={nameA} level={level} text={text} />
          <SiteBlock heading={text.t('plan.one', { plan: text.t('plan.b'), site: nameB })} plan={text.t('plan.b')} site={siteB} name={nameB} level={level} text={text} />
        </>
      )}
    </section>
  )
}
