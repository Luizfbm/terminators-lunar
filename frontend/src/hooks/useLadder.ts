import { useCallback, useEffect, useState } from 'react'
import { ApiError, getLadder, type LadderResult } from '../api/client'
import { siteKey, type Query } from '../domain/query'

/** A panel's data: nothing until it is opened, then loading, an error code, or the answer. */
export type PanelState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'ready'; data: T }

type Settled<T> = { key: string; state: PanelState<T> }

/**
 * Asks `load` only while `open` is true, again whenever `key` changes, and on `retry`. A late
 * answer for an older key never lands on screen.
 */
export function useOnDemand<T>(
  open: boolean,
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): { state: PanelState<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const full = `${key}#${attempt}`
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ key: full, state: { status: 'ready', data } })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const code = error instanceof ApiError ? error.code : 'unknown'
        setSettled({ key: full, state: { status: 'error', code } })
      },
    )
    return () => controller.abort()
    // `load` is rebuilt every render; `full` already says when the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, full])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  if (!open) return { state: { status: 'idle' }, retry }
  if (settled?.key !== full) return { state: { status: 'loading' }, retry }
  return { state: settled.state, retry }
}

/** The Resolution ladder for the Query on screen, asked only once the panel is opened. */
export function useLadder(open: boolean, query: Query): { state: PanelState<LadderResult>; retry: () => void } {
  const key = [siteKey(query.site), query.start.toISOString(), query.durationHours, query.observerHeightM].join('|')
  return useOnDemand(open, key, (signal) => getLadder(query, signal))
}
