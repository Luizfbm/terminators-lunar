import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getMeta, getSites, getVisibility, type Meta, type Site, type VisibilityResult } from '../api/client'
import { buildQuery, DEFAULT_CHOICE, siteKey, type Choice, type SiteRef } from '../domain/query'

export interface Answer {
  meta: Meta
  result: VisibilityResult
}

/**
 * `last` is the previous good answer: it stays on screen while the next Site loads, and behind an
 * error, so the Moon and the numbers never blink out.
 */
export type LoadState =
  | { status: 'loading'; last: Answer | null }
  | { status: 'error'; code: string; last: Answer | null }
  | { status: 'ready'; answer: Answer }

type Outcome = { ok: true; answer: Answer } | { ok: false; code: string }

function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'unknown'
}

/**
 * Answers the Query for a Site (null: the default Site from /meta; a coordinate: a custom Site)
 * over the chosen Window and Observer height (the default Choice: today's default Window).
 */
export function useAnswer(site: SiteRef | null, choice: Choice = DEFAULT_CHOICE): { state: LoadState; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const { startDay, hours, heightM } = choice
  const key = `${siteKey(site)}|${startDay ?? ''}|${hours ?? ''}|${heightM ?? ''}#${attempt}`
  const [settled, setSettled] = useState<{ key: string; outcome: Outcome } | null>(null)
  const [last, setLast] = useState<Answer | null>(null)
  const meta = useRef<Meta | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const run = async (): Promise<Answer> => {
      meta.current ??= await getMeta(controller.signal)
      const result = await getVisibility(
        buildQuery(meta.current, new Date(), site, { startDay, hours, heightM }),
        controller.signal,
      )
      return { meta: meta.current, result }
    }
    run().then(
      (answer) => {
        if (controller.signal.aborted) return
        setLast(answer)
        setSettled({ key, outcome: { ok: true, answer } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ key, outcome: { ok: false, code: errorCode(error) } })
      },
    )
    return () => controller.abort()
    // `key` says when the Site changes; a coordinate is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  if (settled?.key !== key) return { state: { status: 'loading', last }, retry }
  if (settled.outcome.ok) return { state: { status: 'ready', answer: settled.outcome.answer }, retry }
  return { state: { status: 'error', code: settled.outcome.code, last }, retry }
}

/** The Curated Sites, for the list and the dots on the globe. An error here leaves the list empty. */
export function useSites(): Site[] {
  const [sites, setSites] = useState<Site[]>([])
  useEffect(() => {
    const controller = new AbortController()
    getSites(controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setSites(list)
      },
      () => undefined,
    )
    return () => controller.abort()
  }, [])
  return sites
}
