import { useId, useMemo, useState } from 'react'
import { PanelStatus } from '../../PanelStatus'
import type { SiteWindows } from '../site-windows/types'
import { span, usePanelText } from '../site-windows/text'
import { useNeighbours } from './api'
import { isWorse, neighbourHref, neighboursRequest, plannedOf, shown, slipChoices, type NeighbourSite } from './slipPlan'
import { en, pt } from './strings'

type Text = ReturnType<typeof usePanelText<keyof typeof en>>

/** "21 d 4 h more than HW03": the gap to staying at the chosen Site, over the same Window. */
function versus(text: Text, row: NeighbourSite, own: number, site: string): string {
  const gap = row.metrics.sun_and_earth_hours - own
  // Under a minute either way is the same: the engine steps by minutes.
  if (Math.abs(gap) < 1 / 60) return text.t('planB.same', { site })
  return text.t(gap > 0 ? 'planB.more' : 'planB.less', { value: span(text, Math.abs(gap)), site })
}

/**
 * Plan B for a launch that slips (the implementation): at a chosen slip that costs Sun-and-Earth time, the
 * nearby Sites ranked over the slipped Window. Each one is a link to itself on that date.
 */
export function PlanB({ data, shiftWords }: { data: SiteWindows; shiftWords: (days: number) => string }) {
  const text = usePanelText({ en, pt })
  const { t, formatNumber } = text
  const titleId = useId()
  const choices = useMemo(() => slipChoices(data), [data])
  const planned = plannedOf(data)
  const [picked, setPicked] = useState<number>(choices[0]?.window.shift_days ?? 0)
  const slipped = (choices.find((c) => c.window.shift_days === picked) ?? choices[0])?.window ?? null
  const worse = slipped !== null && planned !== null && isWorse(slipped, planned)
  // Asked again only when its key changes (useOnDemand), so building it every render is free.
  const request = worse && slipped ? neighboursRequest(data, slipped) : null
  const { state, retry } = useNeighbours(request)
  if (!slipped || !planned) return null

  const body = (() => {
    if (!worse) {
      return (
        <p className="p4slip__say">
          {t('planB.fine', {
            shift: shiftWords(slipped.shift_days),
            slipped: span(text, slipped.sun_and_earth_hours),
            planned: span(text, planned.sun_and_earth_hours),
          })}
        </p>
      )
    }
    if (!state || state.status === 'loading') {
      return (
        <p className="panel__status" role="status">
          {t('planB.loading')}
        </p>
      )
    }
    if (state.status === 'error') return <PanelStatus code={state.code} onRetry={retry} />
    if (state.status !== 'ready') return null
    const result = state.data
    const site = result.query.site.name
    const own = result.metrics.sun_and_earth_hours
    const rows = shown(result)
    if (rows.length === 0) return <p className="p4slip__say">{t('planB.none')}</p>
    const search = typeof window === 'undefined' ? '' : window.location.search
    return (
      <>
        <p className="p4slip__say">
          {t('planB.lead', {
            shift: shiftWords(slipped.shift_days),
            site,
            slipped: span(text, own),
            lost: span(text, Math.max(0, planned.sun_and_earth_hours - own)),
          })}
        </p>
        <ol className="p4slip__neighbours">
          {rows.map((row) => (
            <li key={row.site.id}>
              <a className="p4slip__neighbour" href={neighbourHref(search, row.site.id, result.query.start)}>
                <span className="p4slip__neighbourName">{row.site.name}</span>
                <span className="p4slip__neighbourFacts">
                  {[
                    t('planB.both', { value: span(text, row.metrics.sun_and_earth_hours) }),
                    row.metrics.lcsp_hours === 0 ? t('planB.noNight') : t('planB.night', { value: span(text, row.metrics.lcsp_hours) }),
                    t('planB.away', { value: formatNumber(Math.round(row.distance_km * 10) / 10) }),
                  ].join(' · ')}
                </span>
                <span className="p4slip__neighbourGap">{versus(text, row, own, site)}</span>
              </a>
            </li>
          ))}
        </ol>
        <p className="p4slip__hint">{t('planB.hint')}</p>
      </>
    )
  })()

  return (
    <section className="p4slip__planB" aria-labelledby={titleId}>
      <h4 id={titleId} className="p4slip__planBTitle">
        {t('planB.title')}
      </h4>
      <div className="p4slip__choices" role="group" aria-label={t('planB.pick')}>
        {choices.map(({ kind, window: w }) => (
          <button key={w.shift_days} type="button" aria-pressed={w.shift_days === slipped.shift_days} onClick={() => setPicked(w.shift_days)}>
            {t(kind === 'worst' ? 'planB.worst' : 'planB.days', { value: formatNumber(w.shift_days) })}
          </button>
        ))}
      </div>
      {body}
    </section>
  )
}
