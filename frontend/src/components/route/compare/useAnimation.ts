import { useCallback, useEffect, useState } from 'react'

/** Progress per second at 1x: the whole animation takes about six seconds. */
const RATE = 0.16
/** A frame never advances more than this, so a background tab does not jump to the end. */
const MAX_STEP_S = 0.05

export const SPEEDS = [0.5, 1, 2] as const
export type Speed = (typeof SPEEDS)[number]

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface Animation {
  /** 0 to 1. */
  progress: number
  playing: boolean
  speed: Speed
  toggle: () => void
  replay: () => void
  seek: (progress: number) => void
  setSpeed: (speed: Speed) => void
}

/**
 * The clock of the drive. With reduced motion the animation does not play by itself: it opens on
 * the finished drive and the person steps through it with the scrubber or the play control.
 */
export function useAnimation(autoplay: boolean): Animation {
  const [progress, setProgress] = useState(autoplay ? 0 : 1)
  const [wantsPlay, setWantsPlay] = useState(autoplay)
  const [speed, setSpeed] = useState<Speed>(1)
  const playing = wantsPlay && progress < 1

  useEffect(() => {
    if (!playing) return
    let id = 0
    let last = 0
    const tick = (now: number) => {
      const step = last === 0 ? 0 : Math.min(MAX_STEP_S, (now - last) / 1000)
      last = now
      setProgress((value) => Math.min(1, value + step * RATE * speed))
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing, speed])

  const toggle = useCallback(() => {
    if (progress >= 1) {
      setProgress(0)
      setWantsPlay(true)
    } else {
      setWantsPlay((value) => !value)
    }
  }, [progress])
  const replay = useCallback(() => {
    setProgress(0)
    setWantsPlay(true)
  }, [])
  const seek = useCallback((value: number) => {
    setProgress(Math.max(0, Math.min(1, value)))
    setWantsPlay(false)
  }, [])

  return { progress, playing, speed, toggle, replay, seek, setSpeed }
}
