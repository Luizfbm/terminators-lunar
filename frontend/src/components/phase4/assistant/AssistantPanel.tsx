import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import { markUntraced } from './marks'
import { fill, sourceLabel, STRINGS, type AskStrings } from './strings'
import { MAX_QUESTION_LENGTH, MAX_TURNS, type AskStatus, type AssistantReply, type AssistantSource, type Turn } from './types'
import './assistant.css'

const HOUR_MS = 3_600_000
const EXAMPLES = ['example1', 'example2', 'example3', 'example4'] as const

function Answer({
  reply,
  s,
  hrefFor,
  onSource,
}: {
  reply: AssistantReply
  s: AskStrings
  hrefFor: (source: AssistantSource) => string
  onSource: (source: AssistantSource) => void
}) {
  const { formatNumber } = useI18n()
  const sourcesTitle = useId()
  const { total, traced, untraced } = reply.numbers
  const missing = total - traced
  const trace = total === 0 ? s.traceNone : total === 1 && traced === 1 ? s.traceOne : fill(s.trace, { traced: formatNumber(traced), total: formatNumber(total) })
  // One source per view: two requests to the same route open the same place on the screen.
  const views = reply.sources.filter((source, index, all) => all.findIndex((other) => sourceLabel(s, other.operation) === sourceLabel(s, source.operation)) === index)
  return (
    <>
      {reply.mode === 'offline' && (
        <p className="ask-offline">
          <strong>{s.offline}</strong> {s.offlineNote}
        </p>
      )}
      {reply.answer.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="ask-answer">
          {markUntraced(paragraph, untraced).map((piece, at) =>
            piece.untraced ? (
              <mark key={at} className="ask-number ask-untraced">
                {piece.text}
                <span className="visually-hidden"> ({s.untracedMark})</span>
              </mark>
            ) : piece.number ? (
              <b key={at} className="ask-number">
                {piece.text}
              </b>
            ) : (
              piece.text
            ),
          )}
        </p>
      ))}
      <p className={missing > 0 ? 'ask-trace ask-trace--short' : 'ask-trace'}>
        <span className="ask-trace__mark" aria-hidden="true">
          {missing > 0 ? '!' : total === 0 ? '·' : '✓'}
        </span>
        <span>
          {trace}
          {missing > 0 && <span className="ask-trace__more">{missing === 1 ? s.untracedOne : fill(s.untracedMany, { count: formatNumber(missing) })}</span>}
        </span>
      </p>
      {views.length > 0 && (
        // A list, not a landmark: every answer has one, and a page of same-named landmarks is noise.
        <div className="ask-sources">
          <span className="ask-sources__title" id={sourcesTitle}>
            {s.sources}
          </span>
          <ul aria-labelledby={sourcesTitle}>
            {views.map((source) => (
              <li key={source.request}>
                <a
                  href={hrefFor(source)}
                  onClick={(event) => {
                    event.preventDefault()
                    onSource(source)
                  }}
                >
                  {sourceLabel(s, source.operation)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/**
 * The assistant (the requirement): a modal sheet over the answer column on a wide screen and the whole
 * screen on a phone. Presentational: the conversation, the draft and the request belong to the
 * caller, which keeps them in memory for the tab and nowhere else.
 */
export function AssistantPanel({
  open,
  onClose,
  context,
  turns,
  status,
  slow = false,
  draft,
  onDraft,
  onAsk,
  onStop,
  onNew,
  hrefFor,
  onSource,
}: {
  open: boolean
  onClose: () => void
  /** The Query on screen, named for the reader; null while the first answer is on its way. */
  context: { site: string; startMs: number; durationHours: number } | null
  turns: readonly Turn[]
  status: AskStatus
  /** The question has waited long enough to say that a long answer is normal. */
  slow?: boolean
  draft: string
  onDraft: (text: string) => void
  onAsk: (question: string) => void
  onStop: () => void
  onNew: () => void
  hrefFor: (source: AssistantSource) => string
  onSource: (source: AssistantSource) => void
}) {
  const { locale, formatDate, formatSpan, formatNumber } = useI18n()
  const s = STRINGS[locale]
  const dialog = useRef<HTMLDialogElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const title = useId()
  const hint = useId()
  const field = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      // The sheet opens to type a question: the box gets the focus, not the first button. React's
      // autoFocus runs before showModal, so it is done here.
      box.current?.focus()
    }
    if (!open && element.open) element.close()
  }, [open])

  // The newest answer is the one to read: keep the log at its end.
  useEffect(() => {
    const element = log.current
    if (element) element.scrollTop = element.scrollHeight
  }, [turns.length, status.status])

  const waiting = status.status === 'waiting'
  const full = turns.length >= MAX_TURNS
  const blocked = waiting || (status.status === 'busy' && status.retryAfterSeconds > 0)
  const question = draft.trim()
  const left = MAX_QUESTION_LENGTH - draft.length

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!question || blocked || full) return
    onAsk(question)
  }
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
  }

  const empty = turns.length === 0 && status.status === 'idle'
  const pending = status.status === 'idle' ? null : status.question

  return (
    <dialog
      ref={dialog}
      className="ask"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className="ask__head">
        <div>
          <h2 id={title} className="ask__title">
            {s.title}
          </h2>
          {context && (
            <p className="ask__about">
              {fill(s.about, {
                site: context.site,
                duration: formatSpan(context.durationHours * HOUR_MS),
                start: formatDate(context.startMs),
              })}
            </p>
          )}
        </div>
        <button type="button" className="ask__close" aria-label={s.closeLabel} onClick={onClose}>
          {s.close}
        </button>
      </header>

      <div ref={log} className="ask__body">
        {empty && (
          <div className="ask-empty">
            <p>{s.intro}</p>
            <p className="ask-empty__title" id={`${title}-examples`}>
              {s.examplesTitle}
            </p>
            <ul aria-labelledby={`${title}-examples`}>
              {EXAMPLES.map((key) => (
                <li key={key}>
                  <button type="button" className="ask-example" onClick={() => {
                      onAsk(s[key])
                      // The example's button goes away with the empty state; the focus waits in the box.
                      box.current?.focus()
                    }}
                  >
                    {s[key]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!empty && (
          <div className="ask-log" role="log" aria-label={s.conversation}>
            {turns.map((turn, index) => (
              <article key={index} className="ask-turn">
                <h3 className="visually-hidden">{s.you}</h3>
                <p className="ask-question">{turn.question}</p>
                <h3 className="ask-turn__who">{s.assistant}</h3>
                <Answer reply={turn.reply} s={s} hrefFor={hrefFor} onSource={onSource} />
              </article>
            ))}
            {pending && (
              <article className="ask-turn">
                <h3 className="visually-hidden">{s.you}</h3>
                <p className="ask-question">{pending}</p>
                {waiting && (
                  <p className="ask-wait" role="status">
                    <span className="ask-wait__dots" aria-hidden="true" />
                    {s.waiting}
                    <button type="button" className="ask-link" onClick={onStop}>
                      {s.stop}
                    </button>
                    {slow && <span className="ask-wait__long">{s.waitingLong}</span>}
                  </p>
                )}
                {status.status === 'busy' && (
                  <p className="ask-problem" role="alert">
                    {status.retryAfterSeconds > 0 ? fill(s.busy, { seconds: formatNumber(status.retryAfterSeconds) }) : s.busyAfter}
                  </p>
                )}
                {status.status === 'error' && (
                  <div className="ask-problem" role="alert">
                    <p>{status.code === 'network' ? s.failedNetwork : status.code === 'invalid_parameter' ? s.failedInvalid : s.failed}</p>
                    <button type="button" className="ask-link" onClick={() => submit()}>
                      {s.retry}
                    </button>
                  </div>
                )}
              </article>
            )}
          </div>
        )}
      </div>

      <footer className="ask__foot">
        {full ? (
          <p className="ask-full">
            {s.full}{' '}
            <button type="button" className="ask-link" onClick={onNew}>
              {s.newConversation}
            </button>
          </p>
        ) : (
          <form className="ask-form" onSubmit={submit}>
            <label htmlFor={field} className="ask-form__label">
              {s.label}
            </label>
            <textarea
              id={field}
              className="ask-form__field"
              rows={2}
              value={draft}
              maxLength={MAX_QUESTION_LENGTH}
              ref={box}
              aria-describedby={hint}
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={onKey}
            />
            <button type="submit" className="ask-form__send" disabled={!question || blocked}>
              {s.send}
            </button>
            <p id={hint} className="ask-form__hint">
              {left < 200 ? fill(s.left, { count: formatNumber(left) }) : s.hint}
            </p>
          </form>
        )}
        <p className="ask__privacy">
          {s.privacy}
          {turns.length > 0 && !full && (
            <>
              {' '}
              <button type="button" className="ask-link" onClick={onNew}>
                {s.newConversation}
              </button>
            </>
          )}
        </p>
      </footer>
    </dialog>
  )
}
