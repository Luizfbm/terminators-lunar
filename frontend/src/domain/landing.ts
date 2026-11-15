import type { Choice, SiteRef } from './query'

/**
 * The real landing the app points to: where IM-2 Athena came to rest, over the two UTC days
 * that hold its whole mission (17:30 on 6 March to 06:15 on 7 March 2025).
 */
export const IM2_SITE_ID = 'IM2'
export const IM2_LANDING: { site: SiteRef; choice: Choice } = {
  site: IM2_SITE_ID,
  choice: { startDay: '2025-03-06', hours: 48, heightM: null },
}
