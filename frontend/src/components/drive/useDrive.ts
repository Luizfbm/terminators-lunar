import { useCallback, useEffect, useRef, useState } from 'react'
import { followLink, readDrive, sameDrive, writeDrive, type DriveState } from './driveLink'

/**
 * The state of "Rover and drive", kept in the link while the sheet is open (like the Classroom figure's
 * latitude) and in memory while it is closed, so opening it again finds the Rover and the mission as they
 * were. The App's link writer carries the parameters it does not own, so the two never undo each other.
 */
export function useDrive(): [DriveState, (change: Partial<DriveState>) => void] {
  const [state, setState] = useState<DriveState>(() => readDrive(window.location.search))
  const latest = useRef(state)

  useEffect(() => {
    const follow = () => {
      latest.current = followLink(latest.current, window.location.search)
      setState(latest.current)
    }
    window.addEventListener('popstate', follow)
    return () => window.removeEventListener('popstate', follow)
  }, [])

  const update = useCallback((change: Partial<DriveState>) => {
    const next = { ...latest.current, ...change }
    if (sameDrive(next, latest.current)) return
    latest.current = next
    setState(next)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${writeDrive(next, window.location.search)}`)
  }, [])

  return [state, update]
}
