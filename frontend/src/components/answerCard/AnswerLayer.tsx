import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { wrapFocus } from '../../domain/details'
import { goToPage } from '../../domain/query'
import { useUncertainty } from '../../hooks/useUncertainty'
import { useI18n } from '../../i18n/I18nContext'
import { AnswerBody, BodyStatement, type AnswerProps } from '../Answer'
import { briefText } from '../brief/strings'
import { STRINGS } from './strings'
import './answerCard.css'

const DRAWER_ID = 'details-drawer'

/** What a Tab can land on inside the drawer. */
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'

/**
 * The answer in the default layout, where there is no column: a card over the stage with the sentence about
 * the Sun, the sentence about the Earth, the Occluder behind each and the DEM Uncertainty band under it (the
 * same statements the column has, not new ones), and a Details button that opens a drawer with the rest of
 * the column. Nothing is computed here: the card and the drawer only place what the answer already says.
 *
 * The drawer is a modal dialog over the globe: Esc, a click outside and its Close button shut it, and the
 * focus goes back to Details. It is built the first time it is opened and then kept, hidden, so what is
 * open in a panel stays open between visits to it.
 */
export function AnswerLayer({
  open,
  onOpen,
  stale,
  ...answer
}: AnswerProps & {
  /** Whether the drawer is open, and the way to open or close it. */
  open: boolean
  onOpen: (open: boolean) => void
  /** The next Site is being asked for: the last answer stays, dimmed. */
  stale: boolean
}) {
  const i18n = useI18n()
  const s = STRINGS[i18n.locale]
  const { result, cursorMs, marked, onMark } = answer
  // Asked once, for the card and for "Stats for nerds" in the drawer.
  const uncertainty = useUncertainty(result)

  const [built, setBuilt] = useState(open)
  if (open && !built) setBuilt(true)

  const detailsButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    // In: the focus goes to the drawer. Out: back to the button that opened it.
    if (open && !wasOpen.current) closeButton.current?.focus()
    if (!open && wasOpen.current) detailsButton.current?.focus()
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      // Something else may have used the key already: the Site list closes itself on Esc.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      onOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpen])

  // The drawer is modal: Tab goes round inside it.
  const keepFocusIn = (event: KeyboardEvent<HTMLElement>) => {
    // A dialog opened from inside it (the Site list) is in another place of the page but in this tree.
    if (event.key !== 'Tab' || !event.currentTarget.contains(event.target as Node)) return
    const stops = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)
    const index = stops.indexOf(document.activeElement as HTMLElement)
    // On something inside the drawer that is not one of its controls (a scrolling box the browser lets
    // the keyboard into): the browser's own step is right.
    if (index < 0 && event.currentTarget.contains(document.activeElement)) return
    const to = wrapFocus(index, stops.length, event.shiftKey)
    if (to === null) return
    event.preventDefault()
    stops[to]?.focus()
  }

  return (
    <>
      <aside className="answer-card" aria-label={s.card} data-stale={stale} inert={open}>
        <p className="answer-card__site">{result.query.site.name}</p>
        <BodyStatement body="sun" result={result} cursorMs={cursorMs} heading="h1" marked={marked === 'sun'} onMark={onMark} uncertainty={uncertainty} />
        <BodyStatement body="earth" result={result} cursorMs={cursorMs} heading="h2" marked={marked === 'earth'} onMark={onMark} uncertainty={uncertainty} />
        <button
          type="button"
          className="answer-card__details"
          ref={detailsButton}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={built ? DRAWER_ID : undefined}
          onClick={() => onOpen(true)}
        >
          {s.details}
        </button>
      </aside>
      {built && (
        <>
          <div className="details__scrim" hidden={!open} onClick={() => onOpen(false)} />
          <section className="details" id={DRAWER_ID} role="dialog" aria-modal="true" aria-labelledby="details-title" hidden={!open} onKeyDown={keepFocusIn}>
            <header className="details__head">
              <h2 id="details-title" className="details__title">
                {s.title}
              </h2>
              <button type="button" className="details__close" ref={closeButton} onClick={() => onOpen(false)}>
                {s.close}
              </button>
            </header>
            <div className="details__body" data-stale={stale}>
              <AnswerBody {...answer} uncertainty={uncertainty} part="details" />
              <p className="details__brief">
                <button type="button" onClick={() => goToPage('brief')}>
                  {briefText(i18n)('brief.open')}
                </button>
              </p>
            </div>
          </section>
        </>
      )}
    </>
  )
}
