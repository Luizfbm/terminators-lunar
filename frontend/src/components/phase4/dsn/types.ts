import type { components } from '../../../api/schema'

export type Interval = components['schemas']['Interval']
export type DsnStation = components['schemas']['DsnStation']
export type DsnResult = components['schemas']['DsnResult']

/** What the panel is showing: the request is still out, it came back, or it failed with a Problem code. */
export type DsnState =
  | { status: 'loading' }
  | { status: 'ready'; data: DsnResult }
  | { status: 'error'; code: string }
