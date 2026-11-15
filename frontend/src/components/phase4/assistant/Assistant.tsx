import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, type VisibilityResult } from '../../../api/client'
import { yearOf } from '../../../domain/year'
import { useI18n } from '../../../i18n/I18nContext'
import { askAssistant, assistantRequest, BusyError } from './api'
import { AskButton } from './AskButton'
import { AssistantPanel } from './AssistantPanel'
import { revealSource, sourceHref } from './reveal'
import type { AskStatus, Turn } from './types'

/** After this long the waiting line says that a long answer is normal. */
export const SLOW_AFTER_MS = 8_000
/** The server answers offline within about 40 s when the model hangs; past this the request is dropped. */
export const GIVE_UP_AFTER_MS = 90_000

type Conversation = { turns: Turn[]; status: AskStatus; draft: string }

const EMPTY: Conversation = { turns: [], status: { status: 'idle' }, draft: '' }

/**
 * The assistant on the screen (the requirement): its button in the top bar and its sheet. It owns the
 * conversation, which lives in this component's memory only: nothing goes in the link or in
 * storage, and closing the tab ends it.
 */
export function Assistant({ result }: { result: VisibilityResult | null }) {
  const { locale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<Conversation>(EMPTY)
  const [slow, setSlow] = useState(false)
  const inFlight = useRef<AbortController | null>(null)
  const { turns, status, draft } = conversation
  const query = result?.query ?? null

  const cancel = useCallback(() => {
    inFlight.current?.abort()
    inFlight.current = null
  }, [])
  useEffect(() => cancel, [cancel])

  const ask = (question: string) => {
    cancel()
    const controller = new AbortController()
    inFlight.current = controller
    const giveUp = window.setTimeout(() => controller.abort(), GIVE_UP_AFTER_MS)
    const request = assistantRequest(turns, question, locale, query)
    setSlow(false)
    setConversation((current) => ({ ...current, status: { status: 'waiting', question }, draft: '' }))
    askAssistant(request, controller.signal)
      .then(
        (reply) => {
          if (inFlight.current !== controller) return
          setConversation((current) => ({ turns: [...current.turns, { question, reply }], status: { status: 'idle' }, draft: current.draft }))
        },
        (error: unknown) => {
          if (inFlight.current !== controller) return
          // Given up after GIVE_UP_AFTER_MS: an abort nobody asked for is a failure, not a stop.
          const next: AskStatus =
            error instanceof BusyError
              ? { status: 'busy', question, retryAfterSeconds: error.retryAfterSeconds }
              : { status: 'error', question, code: error instanceof ApiError ? error.code : 'unknown' }
          // The question goes back in the box, so asking again is one key away.
          setConversation((current) => ({ ...current, status: next, draft: current.draft || question }))
        },
      )
      .finally(() => {
        window.clearTimeout(giveUp)
        if (inFlight.current === controller) inFlight.current = null
      })
  }

  const waiting = status.status === 'waiting'
  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [waiting])

  // The busy state counts its Retry-After down to zero, then the question can go again.
  const retryAfter = status.status === 'busy' ? status.retryAfterSeconds : 0
  useEffect(() => {
    if (retryAfter <= 0) return
    const tick = window.setTimeout(() => {
      setConversation((current) =>
        current.status.status === 'busy'
          ? { ...current, status: { ...current.status, retryAfterSeconds: current.status.retryAfterSeconds - 1 } }
          : current,
      )
    }, 1000)
    return () => window.clearTimeout(tick)
  }, [retryAfter])

  const panels = query
    ? { getVisibilityLadder: t('ladder.open'), getSiteYear: t('year.open', { year: String(yearOf(query.start)) }) }
    : {}

  return (
    <>
      <AskButton open={open} onOpen={() => setOpen(true)} />
      {createPortal(
        <AssistantPanel
          open={open}
          onClose={() => setOpen(false)}
          context={query ? { site: query.site.name, startMs: Date.parse(query.start), durationHours: query.duration_hours } : null}
          turns={turns}
          status={status}
          slow={slow}
          draft={draft}
          onDraft={(text) => setConversation((current) => ({ ...current, draft: text }))}
          onAsk={ask}
          onStop={() => {
            cancel()
            setConversation((current) => ({
              ...current,
              status: { status: 'idle' },
              draft: current.status.status === 'idle' ? current.draft : current.status.question,
            }))
          }}
          onNew={() => {
            cancel()
            setConversation(EMPTY)
          }}
          hrefFor={sourceHref}
          onSource={(source) => {
            setOpen(false)
            revealSource(source, panels)
          }}
        />,
        document.body,
      )}
    </>
  )
}
