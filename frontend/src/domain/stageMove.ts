import type { View } from './query'

/**
 * The move between the globe and the view from the ground (the requirement): two scenes and a fade,
 * never one merged scene. Going down, the globe's camera dives to the Site, then the ground view
 * fades in over it while it lifts from looking down to the horizon. Going back up is the reverse:
 * the ground view lowers its eyes and fades out, then the globe's camera pulls back. If the ground
 * view is not ready when the dive ends, the globe holds its last frame: no loading mark in the
 * middle of the move. With reduced motion there is no flight and no lift, only a short fade.
 *
 * The whole move fits in MOVE_MAX_MS: the dive and the fade one after the other, the lift inside
 * the fade's time plus a little, as the Sky eases towards the horizon.
 */

export type GlobeMode = 'orbit' | 'map'

export type Phase =
  /** Nothing moving: `shown` is on screen. */
  | 'idle'
  /** The globe's camera flies down to the Site. */
  | 'diving'
  /** The dive is over and the ground view is not ready: the globe holds its frame. */
  | 'holding'
  /** The ground view fades in over the globe. */
  | 'fading-in'
  /** The ground view fades out over the globe, which waits at the dive's end. */
  | 'fading-out'
  /** The ground view is gone; the globe's camera pulls back. */
  | 'pulling-back'

export interface Stage {
  /** The view whose scene is on screen, or the one the move leaves. */
  shown: View
  /** What the visitor asked for last; a move under way finishes first. */
  wanted: View
  /** How the globe is shown, the last view that was not the ground. */
  globeMode: GlobeMode
  phase: Phase
  /** The ground view's code and data have arrived. */
  ready: boolean
  /** The visitor asked for reduced motion. */
  still: boolean
}

export type StageEvent =
  | { type: 'want'; view: View }
  | { type: 'ready' }
  /** The globe's camera reached the Site (or the wait for it ran out). */
  | { type: 'dived' }
  /** The fade in or out is over. */
  | { type: 'faded' }
  /** The globe's camera is back where the view puts it. */
  | { type: 'pulled' }

export const DIVE_MS = 500
export const FADE_MS = 300
/** The lift from looking down to the horizon, eased by the Sky, starts with the fade. */
export const LIFT_MS = 430
export const STILL_FADE_MS = 200
export const MOVE_MAX_MS = 1200

/** How long the fade takes, by motion preference. */
export const fadeMs = (still: boolean) => (still ? STILL_FADE_MS : FADE_MS)

export function startStage(view: View, still: boolean): Stage {
  return { shown: view, wanted: view, globeMode: view === 'ground' ? 'orbit' : view, phase: 'idle', ready: false, still }
}

/** From rest, the next move towards what is wanted. */
function next(stage: Stage): Stage {
  if (stage.phase !== 'idle' || stage.wanted === stage.shown) return stage
  const { wanted } = stage
  if (wanted !== 'ground') {
    if (stage.shown !== 'ground') return { ...stage, shown: wanted, globeMode: wanted }
    return { ...stage, globeMode: wanted, phase: 'fading-out' }
  }
  if (stage.still) return { ...stage, phase: stage.ready ? 'fading-in' : 'holding' }
  return { ...stage, phase: 'diving' }
}

export function stepStage(stage: Stage, event: StageEvent): Stage {
  switch (event.type) {
    case 'want':
      return next({ ...stage, wanted: event.view })
    case 'ready':
      if (stage.ready) return stage
      return { ...stage, ready: true, phase: stage.phase === 'holding' ? 'fading-in' : stage.phase }
    case 'dived':
      if (stage.phase !== 'diving') return stage
      return { ...stage, phase: stage.ready ? 'fading-in' : 'holding' }
    case 'faded':
      if (stage.phase === 'fading-in') return next({ ...stage, shown: 'ground', phase: 'idle' })
      if (stage.phase === 'fading-out') {
        if (stage.still) return next({ ...stage, shown: stage.globeMode, phase: 'idle' })
        return { ...stage, shown: stage.globeMode, phase: 'pulling-back' }
      }
      return stage
    case 'pulled':
      if (stage.phase !== 'pulling-back') return stage
      return next({ ...stage, phase: 'idle' })
  }
}

/** What each scene does in a Stage. */
export interface Scenes {
  /** The globe is drawn (otherwise it waits, hidden and paused, under the ground view). */
  globeShown: boolean
  /** The globe's camera is at, or on its way to, the Site's dive point. */
  globeDived: boolean
  /** The ground view is mounted. */
  groundMounted: boolean
  /** The ground view's fade, if one is playing. */
  groundFade: 'in' | 'out' | null
  /** How the ground view's camera moves: lifting to the horizon, lowering its eyes, or neither. */
  skyPose: 'arrive' | 'leave' | 'stay'
}

export function scenesOf(stage: Stage): Scenes {
  const { phase, shown } = stage
  const onGround = shown === 'ground' && phase === 'idle'
  return {
    globeShown: !onGround,
    globeDived: !stage.still && (phase === 'diving' || phase === 'holding' || phase === 'fading-in' || phase === 'fading-out' || onGround),
    groundMounted: onGround || phase === 'fading-in' || phase === 'fading-out',
    groundFade: phase === 'fading-in' ? 'in' : phase === 'fading-out' ? 'out' : null,
    skyPose: phase === 'fading-out' ? 'leave' : phase === 'fading-in' && !stage.still ? 'arrive' : 'stay',
  }
}

/** The longest a move takes once the ground view is ready: under MOVE_MAX_MS by construction. */
export function moveMs(still: boolean, down: boolean): number {
  if (still) return STILL_FADE_MS
  return down ? DIVE_MS + Math.max(FADE_MS, LIFT_MS) : FADE_MS + DIVE_MS
}
