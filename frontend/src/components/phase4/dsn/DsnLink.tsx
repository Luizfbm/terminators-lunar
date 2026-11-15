import { useEffect, useState } from 'react'
import type { VisibilityResult } from '../../../api/client'
import { useOnDemand } from '../../../hooks/useLadder'
import { dsnPath, getDsn, publishDsn } from './api'
import { DsnPanel } from './DsnPanel'
import type { DsnState } from './types'

/**
 * The DSN link panel on the screen (the requirement), with the Resolution ladder and the year inside
 * "Stats for nerds". Closed by default, like them, and asked only once opened.
 */
export function DsnLink({ result }: { result: VisibilityResult }) {
  const [open, setOpen] = useState(false)
  const key = dsnPath(result.query)
  const { state, retry } = useOnDemand(open, key, (signal) => getDsn(result.query, signal))
  const shown: DsnState | null = state.status === 'idle' ? null : state

  // The timeline's row follows what the panel has; it lets go when the Query changes or the panel goes.
  useEffect(() => {
    publishDsn(key, shown)
  }, [key, shown])
  useEffect(() => () => publishDsn(key, null), [key])

  return <DsnPanel state={shown ?? { status: 'loading' }} open={open} onToggle={setOpen} onRetry={retry} />
}
