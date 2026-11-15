import type { ReactNode } from 'react'
import type { Occluder, VisibilityEvent, VisibilityResult } from '../api/client'
import { IM2_SITE_ID } from '../domain/landing'
import { headlineKey, movedPast } from '../domain/headline'
import { compassIndex } from '../domain/sky'
import { statement, type Body } from '../domain/statement'
import { useI18n } from '../i18n/I18nContext'
import type { I18n } from '../i18n/i18n'
import type { MessageKey } from '../i18n/messages'
import { Extras } from './Extras'
import type { WindowChoice } from './YearPanel'
import { Nerds } from './Nerds'
import { FlatLine, FlatMetrics } from './phase4/flat-line/FlatLine'
import { KnifeEdgeWarning } from './phase4/miss/KnifeEdgeWarning'
import { MissPanel } from './phase4/miss/MissPanel'
import { useRadius, useScatter } from './phase4/miss/useMiss'
import { WhenToLand } from './phase4/site-windows/WhenToLand'
import { Battery } from './phase4/battery/Battery'
import { Reach } from './phase4/reach/Reach'
import { PlanCompare } from './phase4/compare/PlanCompare'

const HOUR_MS = 3_600_000

/** A sentence with its number set apart, so the number can be styled without breaking the sentence. */
function withNumber(sentence: string, number: string): ReactNode {
  const [before, after] = sentence.split('{span}')
  return (
    <>
      {before}
      <b>{number}</b>
      {after}
    </>
  )
}

function distanceText({ t, formatNumber }: I18n, occluder: Occluder): string {
  const km = occluder.distance_m / 1000
  return km >= 1
    ? t('distance.km', { value: formatNumber(km >= 10 ? Math.round(km) : Math.round(km * 10) / 10) })
    : t('distance.m', { value: formatNumber(Math.round(occluder.distance_m)) })
}

/** "behind the rim of Shackleton, 4.6 km to the south-east": the Occluder in words. */
export function occluderText(i18n: I18n, side: 'behind' | 'over', occluder: Occluder): string {
  const { t } = i18n
  const direction = t(`direction.${compassIndex(occluder.azimuth_deg)}` as MessageKey)
  const feature = occluder.feature ?? null
  const key = `${side}.${feature ? feature.relation : 'none'}` as MessageKey
  return t(key, { name: feature?.name ?? '', distance: distanceText(i18n, occluder), direction })
}

/** "Shackleton, 4.6 km": the Occluder as a short label for the panorama. */
export function occluderLabel(i18n: I18n, occluder: Occluder): string {
  const distance = distanceText(i18n, occluder)
  return occluder.feature ? `${occluder.feature.name}, ${distance}` : distance
}

function BodyStatement({
  body,
  result,
  cursorMs,
  heading,
  marked,
  onMark,
}: {
  body: Body
  result: VisibilityResult
  cursorMs: number
  heading: 'h1' | 'h2'
  marked: boolean
  onMark?: (body: Body) => void
}) {
  const i18n = useI18n()
  const { t, formatDay, formatTime, formatSpan } = i18n
  const said = statement<VisibilityEvent>(body, result.periods, result.events, cursorMs, Date.parse(result.query.end))
  // Once the body has set or risen before the Cursor, say the sentence counts from the Cursor (the implementation).
  const fromCursor = movedPast(body, result.periods, result.events, Date.parse(result.query.start), cursorMs)
  const sentence = t(headlineKey(body, said.kind, fromCursor))
  const Heading = heading

  if (said.kind === 'stays' || said.kind === 'gone') {
    return <Heading className={`say say--${body}`}>{sentence}</Heading>
  }
  const at = Date.parse(said.event.t)
  const where = occluderText(i18n, said.kind === 'sets' ? 'behind' : 'over', said.event.occluder)
  return (
    <>
      <Heading className={`say say--${body}`}>{withNumber(sentence, formatSpan(at - cursorMs))}</Heading>
      <p className="why">
        {onMark ? (
          // The reason is also the way to see it: it marks the Occluder on the horizon.
          <button type="button" className="why__show" aria-pressed={marked} title={t('why.show')} onClick={() => onMark(body)}>
            {t('why', { date: formatDay(at), time: formatTime(at), where })}
          </button>
        ) : (
          t('why', { date: formatDay(at), time: formatTime(at), where })
        )}
      </p>
    </>
  )
}

/** Which summary sentence fits the Window: a zero is said in words, never as "0 min". */
function summaryKey(metrics: VisibilityResult['metrics']): MessageKey {
  if (metrics.sunlit_hours === 0) return 'summary.noSun'
  if (metrics.sun_and_earth_hours === 0) return 'summary.apart'
  if (metrics.lcsp_hours === 0) return 'summary.noNight'
  return 'summary'
}

export function Answer({
  result,
  cursorMs,
  where,
  onWindow,
  marked = null,
  onMark,
  landing,
  stats = false,
  onStats,
}: {
  result: VisibilityResult
  cursorMs: number
  /** The Query line, built by the App, which owns the Query. */
  where: ReactNode
  /** Picking one of the year's best Windows puts it in the Query. */
  onWindow?: (choice: WindowChoice) => void
  /** Whose Occluder is marked on the horizon, if any, and the way to mark one. */
  marked?: Body | null
  onMark?: (body: Body) => void
  /** The way to the IM-2 landing: a real address, and what a click on it does. */
  landing?: { href: string; open: () => void }
  /** Whether "Stats for nerds" is open, and the way to open or close it. */
  stats?: boolean
  onStats?: (open: boolean) => void
}) {
  const i18n = useI18n()
  const { t, formatSpan } = i18n
  const { metrics } = result
  const atLanding = result.query.site.id === IM2_SITE_ID
  // The Landing scatter is asked here so the knife-edge warning and the miss panel read the same answer.
  const radius = useRadius()
  const scatter = useScatter(result, radius[0])
  return (
    <>
      {where}
      <BodyStatement body="sun" result={result} cursorMs={cursorMs} heading="h1" marked={marked === 'sun'} onMark={onMark} />
      <FlatLine result={result} cursorMs={cursorMs} />
      <BodyStatement body="earth" result={result} cursorMs={cursorMs} heading="h2" marked={marked === 'earth'} onMark={onMark} />
      {/* The engine sees this point sunlit, and the mission still ended: say why, here. */}
      {atLanding && <p className="landing-note">{t('landing.im2.note')}</p>}
      <KnifeEdgeWarning scatter={scatter.state} />
      <p className="sum">
        {t(summaryKey(metrics), {
          both: formatSpan(metrics.sun_and_earth_hours * HOUR_MS),
          lit: formatSpan(metrics.lcip_hours * HOUR_MS),
          dark: formatSpan(metrics.lcsp_hours * HOUR_MS),
        })}
      </p>
      <Reach result={result} cursorMs={cursorMs} />
      <FlatMetrics result={result} />
      <WhenToLand result={result} onWindow={onWindow} />
      <Battery result={result} />
      <PlanCompare result={result} />
      <Nerds result={result} cursorMs={cursorMs} open={stats} onOpen={(open) => onStats?.(open)} onWindow={onWindow} />
      {landing && !atLanding && (
        <p className="landing-open">
          <a
            href={landing.href}
            onClick={(event) => {
              event.preventDefault()
              landing.open()
            }}
          >
            {t('landing.im2.open')}
          </a>
        </p>
      )}
      <MissPanel result={result} radius={radius} scatter={scatter} onOpenStats={() => onStats?.(true)} />
      <Extras result={result} />
    </>
  )
}
