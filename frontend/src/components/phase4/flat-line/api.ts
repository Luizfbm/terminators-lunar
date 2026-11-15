import { useEffect, useState } from 'react'
import { getJson, siteParams, toApiInstant, type VisibilityResult } from '../../../api/client'
import { siteRefOf } from '../../../domain/query'
import { useOnDemand, type PanelState } from '../../../hooks/useLadder'
import type { FlatResult } from './types'

type QueryEcho = VisibilityResult['query']

/** The Query on screen, as `/visibility/flat` takes it: the same parameters as `/visibility`. */
export function flatParams(query: QueryEcho): URLSearchParams {
  return new URLSearchParams({
    ...siteParams(siteRefOf(query.site)),
    start: toApiInstant(new Date(query.start)),
    duration_hours: String(query.duration_hours),
    observer_height_m: String(query.observer_height_m),
  })
}

export function flatKey(query: QueryEcho): string {
  return flatParams(query).toString()
}

// The line and the metrics read the same answer: one request per Query, kept for the last few.
const asked = new Map<string, Promise<FlatResult>>()
const KEEP = 4

function getFlat(query: QueryEcho, attempt: number, signal: AbortSignal): Promise<FlatResult> {
  const key = `${flatKey(query)}#${attempt}`
  let pending = asked.get(key)
  if (!pending) {
    // The shared request is not tied to one reader's signal: the other may still be waiting on it.
    pending = getJson<FlatResult>('/visibility/flat', flatParams(query), new AbortController().signal)
    pending.catch(() => asked.delete(key))
    asked.set(key, pending)
    while (asked.size > KEEP) asked.delete(asked.keys().next().value as string)
  }
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    pending.then(resolve, reject)
  })
}

// A retry from either reader asks again for both.
let attempts = 0
const listeners = new Set<() => void>()

export function retryFlat(): void {
  attempts += 1
  for (const listener of listeners) listener()
}

/** The same Query without terrain, asked as soon as an answer is on screen. */
export function useFlat(query: QueryEcho): { state: PanelState<FlatResult>; retry: () => void } {
  const attempt = useAttempt()
  const { state } = useOnDemand(true, `${flatKey(query)}#${attempt}`, (signal) => getFlat(query, attempt, signal))
  return { state, retry: retryFlat }
}

function useAttempt(): number {
  const [attempt, setAttempt] = useState(attempts)
  useEffect(() => {
    const follow = () => setAttempt(attempts)
    listeners.add(follow)
    return () => {
      listeners.delete(follow)
    }
  }, [])
  return attempt
}
