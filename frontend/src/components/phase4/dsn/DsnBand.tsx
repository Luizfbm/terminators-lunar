import { useSyncExternalStore } from 'react'
import type { VisibilityResult } from '../../../api/client'
import { dsnPath, shownDsn, subscribeDsn } from './api'
import { DsnRow } from './DsnRow'

/**
 * The DSN row of the timeline (the requirement), under the Earth row. It draws what the DSN panel has
 * for the Query on screen, and nothing before the panel is opened or when the link and Earth
 * visible are the same.
 */
export function DsnBand({ result }: { result: VisibilityResult }) {
  const shown = useSyncExternalStore(subscribeDsn, shownDsn)
  if (!shown || shown.key !== dsnPath(result.query) || shown.state.status !== 'ready') return null
  const earth = result.periods.filter((period) => period.body === 'earth' && period.state === 'visible')
  return <DsnRow state={shown.state} earthPeriods={earth} startMs={Date.parse(result.query.start)} endMs={Date.parse(result.query.end)} />
}
