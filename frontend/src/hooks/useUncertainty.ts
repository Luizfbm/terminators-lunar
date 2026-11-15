import { useEffect, useState } from 'react'
import type { VisibilityResult } from '../api/client'
import { getUncertainty, type UncertaintyResult } from '../api/uncertainty'
import { queryOf } from '../components/phase4/miss/useMiss'
import { siteKey } from '../domain/query'
import { nextPoll, START_TRACK, type PollTrack } from '../domain/uncertainty'

/**
 * The DEM Uncertainty band of the answer on screen. `none` is the quiet state: not asked yet, or
 * the route said 404, 422 or 503, or it never finished. The answer never waits on this.
 */
export type UncertaintyState =
  | { status: 'none' }
  | { status: 'computing'; clonesDone: number; clones: number }
  | { status: 'ready'; data: UncertaintyResult }

type Settled = { key: string; state: UncertaintyState }

const NONE: UncertaintyState = { status: 'none' }

/**
 * Asks `/visibility/uncertainty` for the Query of `result`, once the answer is there. On 202 it
 * shows the progress and asks again after `Retry-After` (stretched while nothing moves); on 200 it
 * keeps the band; on any error it keeps nothing. One ask at a time, and none outlives the Query
 * or the component.
 */
export function useUncertainty(result: VisibilityResult): UncertaintyState {
  const query = queryOf(result)
  const key = [siteKey(query.site), query.start.toISOString(), query.durationHours, query.observerHeightM].join('|')
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    let timer: number | undefined
    const settle = (state: UncertaintyState) => {
      if (!signal.aborted) setSettled({ key, state })
    }

    const ask = async (track: PollTrack): Promise<void> => {
      let reply
      try {
        reply = await getUncertainty(query, signal)
      } catch {
        settle(NONE)
        return
      }
      if (signal.aborted) return
      if (reply.status === 'ready') {
        settle({ status: 'ready', data: reply.data })
        return
      }
      settle({ status: 'computing', clonesDone: reply.clonesDone, clones: reply.clones })
      const next = nextPoll(track, reply.clonesDone, reply.retryAfterSeconds)
      if (!next) {
        settle(NONE)
        return
      }
      // The next ask is scheduled only now that this one has come back: never two in flight.
      timer = window.setTimeout(() => void ask(next.track), next.delayMs)
    }
    void ask(START_TRACK)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
    // `query` is rebuilt every render; `key` already says when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return settled?.key === key ? settled.state : NONE
}
