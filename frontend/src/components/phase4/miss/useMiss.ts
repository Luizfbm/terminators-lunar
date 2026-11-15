import { useCallback, useEffect, useState } from 'react'
import type { VisibilityResult } from '../../../api/client'
import { readLink, siteKey, siteRefOf, writeLink, type Query } from '../../../domain/query'
import { useOnDemand, type PanelState } from '../../../hooks/useLadder'
import { getScatter, getTerrain } from './api'
import type { ScatterResult, TerrainResult } from './types'

/** The miss IM-2 Athena made, as Intuitive Machines reported it: the radius the panel opens on. */
export const DEFAULT_RADIUS_M = 250

/** The Query the answer on screen was asked with, to ask the same one around the Site. */
export function queryOf(result: VisibilityResult): Query {
  return {
    site: siteRefOf(result.query.site),
    start: new Date(result.query.start),
    durationHours: result.query.duration_hours,
    observerHeightM: result.query.observer_height_m,
  }
}

/**
 * The radius lives in the link, so a reload or a shared link opens on the same one. The App keeps
 * whatever it does not own when it rewrites the link.
 */
export function useRadius(): [number, (radiusM: number) => void] {
  const [radiusM, setRadiusM] = useState(() => readLink(window.location.search).radiusM ?? DEFAULT_RADIUS_M)
  const choose = useCallback((next: number) => {
    setRadiusM(next)
    const query = writeLink({ ...readLink(window.location.search), radiusM: next === DEFAULT_RADIUS_M ? null : next })
    window.history.replaceState(null, '', `${window.location.pathname}${query}`)
  }, [])
  return [radiusM, choose]
}

/** The Landing scatter for the Query on screen; asked again only when the Query or the radius changes. */
export function useScatter(result: VisibilityResult, radiusM: number): { state: PanelState<ScatterResult>; retry: () => void } {
  const query = queryOf(result)
  const key = [siteKey(query.site), query.start.toISOString(), query.durationHours, query.observerHeightM, radiusM].join('|')
  return useOnDemand(true, key, (signal) => getScatter(query, radiusM, signal))
}

/** The Slope around the Site; it does not depend on the Window. */
export function useTerrain(result: VisibilityResult): { state: PanelState<TerrainResult>; retry: () => void } {
  const site = siteRefOf(result.query.site)
  return useOnDemand(true, siteKey(site), (signal) => getTerrain(site, signal))
}

/** Whole seconds since `key` started loading, counted only while `running`. */
export function useSeconds(running: boolean, key: string): number {
  const [tick, setTick] = useState<{ key: string; seconds: number }>({ key, seconds: 0 })
  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const timer = window.setInterval(() => setTick({ key, seconds: Math.floor((Date.now() - started) / 1000) }), 1000)
    return () => window.clearInterval(timer)
  }, [running, key])
  return running && tick.key === key ? tick.seconds : 0
}
