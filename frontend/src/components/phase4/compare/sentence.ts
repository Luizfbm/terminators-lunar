import type { Row, Side, Summary } from '../../../domain/planCompare'
import type { CompareKey } from './strings'

/** What the sentence needs of the screen: the panel's strings and the app's number formats. */
export interface Say {
  t: (key: CompareKey, params?: Record<string, string>) => string
  /** A row's gap as the screen writes it: a span for hours, percentage points for a share. */
  gap: (row: Row) => string
}

const planName = (say: Say, side: Side) => say.t(side === 'a' ? 'plan.a' : 'plan.b')

/**
 * The one summary sentence under the table. It never names a winner when the plans cannot be
 * separated, and when each is better somewhere it says so instead of picking one.
 */
export function planSentence(summary: Summary, say: Say): string {
  const { t } = say
  switch (summary.kind) {
    case 'inseparable':
      return t('sentence.inseparable')
    case 'ahead':
      return t('sentence.ahead', {
        winner: planName(say, summary.winner),
        wins: String(summary.wins),
        what: t(`what.${summary.headline.metric}`),
        gap: say.gap(summary.headline),
      })
    case 'mixed': {
      const winner = summary.headline.better as Side
      return t('sentence.mixed', {
        winner: planName(say, winner),
        what: t(`what.${summary.headline.metric}`),
        gap: say.gap(summary.headline),
        other: planName(say, winner === 'a' ? 'b' : 'a'),
        against: t(`what.${summary.against.metric}`),
      })
    }
  }
}
