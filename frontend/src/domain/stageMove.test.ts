import { describe, expect, it } from 'vitest'
import { DIVE_MS, FADE_MS, LIFT_MS, MOVE_MAX_MS, STILL_FADE_MS, fadeMs, moveMs, scenesOf, startStage, stepStage, type Stage, type StageEvent } from './stageMove'

const run = (stage: Stage, ...events: StageEvent[]) => events.reduce(stepStage, stage)

describe('the move between the globe and the ground (the requirement)', () => {
  it('dives, fades in and lands on the ground, the globe holding at the Site under the fade', () => {
    const start = run(startStage('orbit', false), { type: 'ready' })
    const diving = stepStage(start, { type: 'want', view: 'ground' })
    expect(diving.phase).toBe('diving')
    expect(scenesOf(diving)).toEqual({ globeShown: true, globeDived: true, groundMounted: false, groundFade: null, skyPose: 'stay' })

    const fading = stepStage(diving, { type: 'dived' })
    expect(fading.phase).toBe('fading-in')
    // Both scenes are there during the fade: the globe under, the ground over, so no black frame.
    expect(scenesOf(fading)).toEqual({ globeShown: true, globeDived: true, groundMounted: true, groundFade: 'in', skyPose: 'arrive' })

    const landed = stepStage(fading, { type: 'faded' })
    expect(landed).toMatchObject({ shown: 'ground', phase: 'idle' })
    expect(scenesOf(landed)).toEqual({ globeShown: false, globeDived: true, groundMounted: true, groundFade: null, skyPose: 'stay' })
  })

  it('holds the globe at the Site, with no ground view and so no loading mark, until the ground is ready', () => {
    const holding = run(startStage('orbit', false), { type: 'want', view: 'ground' }, { type: 'dived' })
    expect(holding.phase).toBe('holding')
    expect(scenesOf(holding)).toMatchObject({ globeShown: true, globeDived: true, groundMounted: false })
    expect(stepStage(holding, { type: 'faded' })).toBe(holding)
    expect(stepStage(holding, { type: 'ready' }).phase).toBe('fading-in')
  })

  it('goes back up in reverse: the sky lowers and fades out, then the globe pulls back', () => {
    const onGround = run(startStage('orbit', false), { type: 'ready' }, { type: 'want', view: 'ground' }, { type: 'dived' }, { type: 'faded' })
    const leaving = stepStage(onGround, { type: 'want', view: 'orbit' })
    expect(leaving.phase).toBe('fading-out')
    expect(scenesOf(leaving)).toEqual({ globeShown: true, globeDived: true, groundMounted: true, groundFade: 'out', skyPose: 'leave' })

    const pulling = stepStage(leaving, { type: 'faded' })
    expect(pulling).toMatchObject({ shown: 'orbit', phase: 'pulling-back' })
    expect(scenesOf(pulling)).toMatchObject({ globeShown: true, globeDived: false, groundMounted: false })

    expect(stepStage(pulling, { type: 'pulled' })).toMatchObject({ shown: 'orbit', phase: 'idle' })
  })

  it('comes back to the map when the dive started from the map, or goes to the map when asked', () => {
    const fromMap = run(startStage('map', false), { type: 'ready' }, { type: 'want', view: 'ground' }, { type: 'dived' }, { type: 'faded' })
    expect(fromMap.globeMode).toBe('map')
    const back = run(fromMap, { type: 'want', view: 'orbit' }, { type: 'faded' }, { type: 'pulled' })
    expect(back).toMatchObject({ shown: 'orbit', globeMode: 'orbit', phase: 'idle' })
  })

  it('finishes the move under way before the next one, and takes the last view asked for', () => {
    const diving = run(startStage('orbit', false), { type: 'ready' }, { type: 'want', view: 'ground' })
    const changed = run(diving, { type: 'want', view: 'map' }, { type: 'want', view: 'orbit' })
    expect(changed).toMatchObject({ phase: 'diving', wanted: 'orbit' })
    // The dive and the fade land on the ground, and the way back up starts at once.
    const after = run(changed, { type: 'dived' }, { type: 'faded' })
    expect(after).toMatchObject({ shown: 'ground', phase: 'fading-out', globeMode: 'orbit' })
  })

  it('moves between orbit and the map at once: the globe flies on its own', () => {
    expect(stepStage(startStage('orbit', false), { type: 'want', view: 'map' })).toMatchObject({ shown: 'map', globeMode: 'map', phase: 'idle' })
  })

  it('with reduced motion gets a short fade only: no dive, no lift, no pull back', () => {
    const still = startStage('orbit', true)
    const notReady = stepStage(still, { type: 'want', view: 'ground' })
    expect(notReady.phase).toBe('holding')
    const fading = stepStage(notReady, { type: 'ready' })
    expect(scenesOf(fading)).toEqual({ globeShown: true, globeDived: false, groundMounted: true, groundFade: 'in', skyPose: 'stay' })
    const landed = stepStage(fading, { type: 'faded' })
    const back = run(landed, { type: 'want', view: 'map' }, { type: 'faded' })
    expect(back).toMatchObject({ shown: 'map', phase: 'idle' })
    expect(fadeMs(true)).toBe(STILL_FADE_MS)
  })

  it('a link opened on the ground starts there, with nothing to play', () => {
    const stage = startStage('ground', false)
    expect(stage).toMatchObject({ shown: 'ground', phase: 'idle', globeMode: 'orbit' })
    expect(scenesOf(stage)).toMatchObject({ globeShown: false, groundMounted: true, groundFade: null })
  })

  it('keeps every move within 1.2 s once the ground is ready', () => {
    for (const still of [false, true]) {
      for (const down of [false, true]) expect(moveMs(still, down)).toBeLessThanOrEqual(MOVE_MAX_MS)
    }
    expect(moveMs(false, true)).toBe(DIVE_MS + Math.max(FADE_MS, LIFT_MS))
    expect(fadeMs(false)).toBe(FADE_MS)
  })
})
