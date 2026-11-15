import { useCallback, useEffect, useState } from 'react'
import { getMeta, getVisibility, type Meta, type VisibilityResult } from '../../../api/client'
import { planBQuery, sameQuery } from '../../../domain/planCompare'
import { readLink, siteKey, writeLink, type PlanBLink, type Query } from '../../../domain/query'
import { useOnDemand, type PanelState } from '../../../hooks/useLadder'

/**
 * Plan B's own answer: the same `/visibility` as Plan A, asked a second time with Plan B's Query.
 * Nothing is asked while Plan B is the same Query as Plan A, which has nothing to compare.
 */
export function usePlanB(planA: Query, link: PlanBLink): { query: Query; same: boolean; state: PanelState<VisibilityResult>; retry: () => void } {
  const query = planBQuery(planA, link)
  const same = sameQuery(planA, query)
  const key = [siteKey(query.site), query.start.toISOString(), query.durationHours, query.observerHeightM].join('|')
  const { state, retry } = useOnDemand(!same, key, (signal) => getVisibility(query, signal))
  return { query, same, state, retry }
}

/** `/meta` for the limits of the Window fields. Without it the fields simply have no limits. */
export function useCoverage(): Meta['coverage'] | null {
  const [coverage, setCoverage] = useState<Meta['coverage'] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    getMeta(controller.signal).then(
      (meta) => {
        if (!controller.signal.aborted) setCoverage(meta.coverage)
      },
      () => undefined,
    )
    return () => controller.abort()
  }, [])
  return coverage
}

function read(): PlanBLink | null {
  return readLink(window.location.search).planB ?? null
}

/**
 * Plan B as the link keeps it: null while the comparison is closed. The panel is the only one to
 * write it; the App's link writer reads it back from the address, so the two never undo each other.
 */
export function usePlanBLink(): [PlanBLink | null, (next: PlanBLink | null) => void] {
  const [link, setLink] = useState(read)
  useEffect(() => {
    const follow = () => setLink(read())
    window.addEventListener('popstate', follow)
    return () => window.removeEventListener('popstate', follow)
  }, [])
  const set = useCallback((next: PlanBLink | null) => {
    setLink(next)
    const search = window.location.search
    const query = writeLink({ ...readLink(search), planB: next }, search)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query}`)
  }, [])
  return [link, set]
}
