export interface Duration {
  hours: number
  minutes: number
}

/** Whole hours and minutes, rounded down. A negative duration counts as zero. */
export function splitDuration(ms: number): Duration {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}

export interface Span {
  days: number
  hours: number
  minutes: number
}

/** Whole days, hours and minutes, rounded down. A negative span counts as zero. */
export function splitSpan(ms: number): Span {
  const { hours, minutes } = splitDuration(ms)
  return { days: Math.floor(hours / 24), hours: hours % 24, minutes }
}
