import { useState } from 'react'
import type { Meta, VisibilityEvent, VisibilityResult } from '../../api/client'
import { goToPage } from '../../domain/query'
import { movedPast, headlineKey } from '../../domain/headline'
import { statement, type Body } from '../../domain/statement'
import { nextEvent } from '../../domain/sunset'
import { useUncertainty, type UncertaintyState } from '../../hooks/useUncertainty'
import { useI18n } from '../../i18n/I18nContext'
import { occluderText } from '../Answer'
import { Numbers } from '../Numbers'
import { coordinate } from '../siteName'
import { UncertaintyLine } from '../UncertaintyLine'
import { BriefHorizon } from './BriefHorizon'
import { briefLinks } from './links'
import { printWait, printWhenLoaded } from './print'
import { briefText } from './strings'
import './brief.css'

const HOUR_MS = 3_600_000

/** The Print button: it only asks; what to wait for is the page's business (`printWait`). */
export function PrintButton({ label, disabled, onPrint }: { label: string; disabled: boolean; onPrint: () => void }) {
  return (
    <button type="button" className="brief__print" disabled={disabled} onClick={onPrint}>
      {label}
    </button>
  )
}

/** The headline for one body at the Cursor, worded exactly as on the screen. */
function Sentence({ body, result, cursorMs }: { body: Body; result: VisibilityResult; cursorMs: number }) {
  const { t, formatSpan } = useI18n()
  const said = statement<VisibilityEvent>(body, result.periods, result.events, cursorMs, Date.parse(result.query.end))
  const fromCursor = movedPast(body, result.periods, result.events, Date.parse(result.query.start), cursorMs)
  const key = headlineKey(body, said.kind, fromCursor)
  const sentence =
    said.kind === 'sets' || said.kind === 'rises' ? t(key, { span: formatSpan(Date.parse(said.event.t) - cursorMs) }) : t(key)
  return <p className={`brief__say brief__say--${body}`}>{sentence}</p>
}

/** One line of the Countdown: the next Sunset or Earthset after the Cursor, with its Occluder and its band. */
function CountdownRow({
  body,
  result,
  cursorMs,
  uncertainty,
}: {
  body: Body
  result: VisibilityResult
  cursorMs: number
  uncertainty: UncertaintyState
}) {
  const i18n = useI18n()
  const { t, formatDay, formatTime, formatSpan } = i18n
  const text = briefText(i18n)
  const next = nextEvent<VisibilityEvent>(result.events, body === 'sun' ? 'sunset' : 'earthset', cursorMs, Date.parse(result.query.end))
  const heading = text(body === 'sun' ? 'brief.nextSunset' : 'brief.nextEarthset')
  if (!next) {
    return (
      <li className="brief__event">
        <h3>{heading}</h3>
        <p>{text(body === 'sun' ? 'brief.noSunset' : 'brief.noEarthset')}</p>
      </li>
    )
  }
  const at = Date.parse(next.t)
  const why = t('why', { date: formatDay(at), time: formatTime(at), where: occluderText(i18n, 'behind', next.occluder) })
  return (
    <li className="brief__event">
      <h3>{heading}</h3>
      <p>{text('brief.countdownEvent', { span: formatSpan(at - cursorMs), why })}</p>
      <UncertaintyLine uncertainty={uncertainty} event={next} events={result.events} />
    </li>
  )
}

/** What the sheet needs: the answer, `/meta`, the Cursor, and where the page lives for the links. */
interface SheetProps {
  result: VisibilityResult
  meta: Meta
  cursorMs: number
  /** The address without its query string: origin and path, for the links the sheet prints. */
  baseUrl: string
  /** When the sheet was made. */
  generatedMs: number
}

/**
 * The sheet itself, as it is printed: the Query, the answer, the numbers, the Countdown, the Horizon
 * mask and the links. It knows nothing of the page around it, so what it says is a function of its props.
 */
export function BriefSheet({ result, meta, cursorMs, baseUrl, generatedMs, uncertainty }: SheetProps & { uncertainty: UncertaintyState }) {
  const i18n = useI18n()
  const { t, locale, formatDate, formatTime, formatSpan, formatNumber } = i18n
  const text = briefText(i18n)
  const { query } = result
  const at = (ms: number) => `${formatDate(ms)}, ${formatTime(ms)}`
  const links = briefLinks(baseUrl, result, locale, cursorMs)

  return (
    <article className="brief__sheet" data-testid="brief-sheet">
      {result.provenance.synthetic && <p className="brief__demo">{t('demo')}</p>}
      <header className="brief__head">
        <p className="brief__kicker">
          {t('app.name')} · {t('app.place')}
        </p>
        <h1>{text('brief.title')}</h1>
      </header>

      <section aria-labelledby="brief-query">
        <h2 id="brief-query">{text('brief.query')}</h2>
        <dl className="brief__facts">
          <div>
            <dt>{text('brief.site')}</dt>
            <dd>{query.site.name}</dd>
          </div>
          <div>
            <dt>{text('brief.coordinates')}</dt>
            <dd>{coordinate(query.site, i18n)}</dd>
          </div>
          <div>
            <dt>{text('brief.window')}</dt>
            <dd>
              {text('brief.windowValue', {
                start: at(Date.parse(query.start)),
                end: at(Date.parse(query.end)),
                hours: formatSpan(query.duration_hours * HOUR_MS),
              })}
            </dd>
          </div>
          <div>
            <dt>{text('brief.height')}</dt>
            <dd>{text('brief.heightValue', { height: formatNumber(query.observer_height_m) })}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="brief-answer">
        <h2 id="brief-answer">{text('brief.answer')}</h2>
        <Sentence body="sun" result={result} cursorMs={cursorMs} />
        <Sentence body="earth" result={result} cursorMs={cursorMs} />
        <p className="brief__note">{text('brief.cursor', { instant: at(cursorMs) })}</p>
      </section>

      <section aria-labelledby="brief-numbers" className="brief__keep">
        <h2 id="brief-numbers">{text('brief.numbers')}</h2>
        <Numbers result={result} uncertainty={uncertainty} />
      </section>

      <section aria-labelledby="brief-countdown" className="brief__keep">
        <h2 id="brief-countdown">{text('brief.countdown')}</h2>
        <ul className="brief__events">
          <CountdownRow body="sun" result={result} cursorMs={cursorMs} uncertainty={uncertainty} />
          <CountdownRow body="earth" result={result} cursorMs={cursorMs} uncertainty={uncertainty} />
        </ul>
      </section>

      <section aria-labelledby="brief-horizon" className="brief__keep">
        <h2 id="brief-horizon">{text('brief.horizon')}</h2>
        <BriefHorizon result={result} />
      </section>

      <footer className="brief__foot brief__keep">
        <h2>{text('brief.links')}</h2>
        <dl className="brief__facts">
          <div>
            <dt>{text('brief.queryLink')}</dt>
            <dd>
              <a href={links.query}>{links.query}</a>
            </dd>
          </div>
          <div>
            <dt>{text('brief.proofLink')}</dt>
            <dd>
              <a href={links.proof}>{links.proof}</a>
            </dd>
          </div>
          <div>
            <dt>{text('brief.engine')}</dt>
            <dd>{meta.engine_version}</dd>
          </div>
          <div>
            <dt>{text('brief.generated')}</dt>
            <dd>{text('brief.generatedValue', { instant: at(generatedMs) })}</dd>
          </div>
        </dl>
      </footer>
    </article>
  )
}

/**
 * "Printable brief": one A4 sheet built from the Query already on screen. Everything on it comes
 * from the answer and `/meta`, with nothing asked again but the Uncertainty band the answer already
 * shows. The page is in the link (`?page=brief`), so opening that link shows the sheet.
 */
export function Brief({
  loading = false,
  generatedMs,
  ...sheet
}: Omit<SheetProps, 'generatedMs'> & {
  /** Another answer is being fetched: the sheet still shows this one, but it is not the final one to print. */
  loading?: boolean
  /** When the sheet was made; the page's opening, unless a test says otherwise. */
  generatedMs?: number
}) {
  const i18n = useI18n()
  const text = briefText(i18n)
  const uncertainty = useUncertainty(sheet.result)
  const [openedMs] = useState(() => generatedMs ?? Date.now())
  const wait = printWait(loading, uncertainty)

  return (
    <main className="brief">
      <div className="brief__toolbar">
        <a
          className="brief__back"
          href="?"
          onClick={(event) => {
            event.preventDefault()
            goToPage('answer')
          }}
        >
          ← {text('brief.back')}
        </a>
        <PrintButton label={text('brief.print')} disabled={wait !== null} onPrint={() => void printWhenLoaded(window)} />
        {wait && (
          <p className="brief__wait" role="status">
            {text(wait === 'band' ? 'brief.printWaiting' : 'brief.printLoading')}
          </p>
        )}
      </div>
      <BriefSheet {...sheet} generatedMs={openedMs} uncertainty={uncertainty} />
    </main>
  )
}
