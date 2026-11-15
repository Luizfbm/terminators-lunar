import { useSyncExternalStore } from 'react'
import { useOnDemand } from '../../../hooks/useLadder'
import { getSiteWindows } from './api'
import { requestKey, toleranceFromLink, type WindowsRequest } from './request'
import type { PanelState, SiteWindows } from './types'

/**
 * The Windows for one request, or `curated-only` for a custom Site, which is never asked. A cold
 * answer takes the server about 20 s; it loads on its own, so the rest of the screen never waits.
 */
export function useSiteWindows(request: WindowsRequest | null): { state: PanelState<SiteWindows>; retry: () => void } {
  const { state, retry } = useOnDemand(request !== null, request ? requestKey(request) : '', (signal) =>
    getSiteWindows(request!, signal),
  )
  if (request === null || state.status === 'idle') return { state: { status: 'curated-only' }, retry }
  return { state, retry }
}

// The link is written by the App (`history.replaceState`), which fires no event, so the slip looks
// at it twice a second as well as on the back and forward buttons.
const LINK_POLL_MS = 500

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, LINK_POLL_MS)
  window.addEventListener('popstate', onChange)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('popstate', onChange)
  }
}

/** The Darkness tolerance the link carries now, in hours, or null. */
export function useLinkTolerance(): number | null {
  return useSyncExternalStore(subscribe, () => toleranceFromLink(window.location.search))
}
