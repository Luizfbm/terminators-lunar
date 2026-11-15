import { useMemo } from 'react'
import type { VisibilityResult } from '../../../api/client'
import { isCustomSite } from '../../../domain/query'
import { LandingDay } from '../landing-day/LandingDay'
import { Slip } from '../slip/Slip'
import { slipRequest, yearRequest, type WindowsQuery } from './request'
import type { ShiftedWindow } from './types'
import { useLinkTolerance, useSiteWindows } from './useSiteWindows'

/** A Window to put in the Query: its start and its length. */
export interface WindowPick {
  start: string
  durationHours: number
}

/**
 * The day to land and the launch slip, under the summary sentence. Both hang from the answer on
 * screen and change the Query through `onWindow`, so every setting lives in the link the App
 * writes: a start day is `start`, a Window length is `hours`.
 */
export function WhenToLand({ result, onWindow }: { result: VisibilityResult; onWindow?: (pick: WindowPick) => void }) {
  const { site, start, duration_hours: durationHours, observer_height_m: observerHeightM } = result.query
  const query = useMemo<WindowsQuery | null>(
    () => (isCustomSite(site) ? null : { siteId: site.id, start, durationHours, observerHeightM }),
    [site, start, durationHours, observerHeightM],
  )
  const year = useSiteWindows(useMemo(() => (query ? yearRequest(query) : null), [query]))
  const slip = useSiteWindows(useMemo(() => (query ? slipRequest(query) : null), [query]))
  const tolerance = useLinkTolerance()
  const pick = (window: ShiftedWindow) => onWindow?.({ start: window.start, durationHours })

  return (
    <>
      <LandingDay
        state={year.state}
        year={new Date(start).getUTCFullYear()}
        durationHours={durationHours}
        queryDay={start.slice(0, 10)}
        onDuration={(hours) => onWindow?.({ start, durationHours: hours })}
        onDay={pick}
        onRetry={year.retry}
      />
      <Slip state={slip.state} darknessToleranceHours={tolerance} onSlip={pick} onRetry={slip.retry} />
    </>
  )
}
