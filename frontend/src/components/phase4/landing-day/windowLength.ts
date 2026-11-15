import { SYNODIC_MONTH_HOURS } from '../site-windows/types'

/** Is this the synodic month (the contract rounds it to 708.73 h)? */
export const isSynodic = (hours: number) => Math.abs(hours - SYNODIC_MONTH_HOURS) < 0.01

/** A Window length in words: "one synodic month", "14 days", or a span for anything else. */
export function lengthWords(
  hours: number,
  words: { synodic: string; days: (value: string) => string; span: (hours: number) => string; number: (value: number) => string },
): string {
  if (isSynodic(hours)) return words.synodic
  if (hours % 24 === 0) return words.days(words.number(hours / 24))
  return words.span(hours)
}
