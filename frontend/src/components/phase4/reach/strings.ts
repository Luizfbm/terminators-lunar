// How far our horizon reaches and the rule for when the Sun and the Earth count as visible
// (issues 15 and 11). Glossary terms as in GLOSSARY.md: Horizon mask, Occluder (said as "high ground",
// as the Countdown says it), Sun, Earth visible. Plain data: messages.ts spreads it into the app's catalogues.
export const en = {
  'reach': 'Our horizon reaches {reach}.',
  'reach.with': 'Our horizon reaches {reach}; {list}.',
  'reach.and': ' and ',
  'reach.sunset': 'the Sun sets behind high ground {distance} away',
  'reach.sunrise': 'the Sun rises over high ground {distance} away',
  'reach.earthset': 'the Earth sets behind high ground {distance} away',
  'reach.earthrise': 'the Earth rises over high ground {distance} away',
  'rule': 'The Sun counts as visible while any part of its disc is in view; the Earth counts by its centre.',
}

export type ReachKey = keyof typeof en

export const pt: Record<ReachKey, string> = {
  'reach': 'O nosso horizonte vai até {reach}.',
  'reach.with': 'O nosso horizonte vai até {reach}; {list}.',
  'reach.and': ' e ',
  'reach.sunset': 'o Sol se põe atrás de um relevo a {distance}',
  'reach.sunrise': 'o Sol nasce por cima de um relevo a {distance}',
  'reach.earthset': 'a Terra some atrás de um relevo a {distance}',
  'reach.earthrise': 'a Terra aparece por cima de um relevo a {distance}',
  'rule': 'O Sol conta como visível enquanto qualquer pedaço do disco estiver à vista; a Terra conta pelo centro.',
}
