// "Check in JPL Horizons": the row under the Sun's and the Earth's position at the Cursor, in both languages.
// Glossary terms as written in GLOSSARY.md. Plain data: messages.ts spreads it into the app's catalogues.

export const en = {
  'horizons.row': 'Check in JPL Horizons',
  'horizons.sun': 'Sun',
  'horizons.earth': 'Earth',
  'horizons.sunLabel': 'Check the Sun in JPL Horizons, opens in a new tab',
  'horizons.earthLabel': 'Check the Earth in JPL Horizons, opens in a new tab',
  'horizons.hint':
    'Horizons is asked for this Site on the Moon at the Observer height, at the instant of the numbers above, airless, and prints azimuth and elevation to compare with them.',
}

export const pt: Record<keyof typeof en, string> = {
  'horizons.row': 'Conferir no JPL Horizons',
  'horizons.sun': 'Sol',
  'horizons.earth': 'Terra',
  'horizons.sunLabel': 'Conferir o Sol no JPL Horizons, abre em outra aba',
  'horizons.earthLabel': 'Conferir a Terra no JPL Horizons, abre em outra aba',
  'horizons.hint':
    'O Horizons é consultado para este Local na Lua, na Altura do observador, no instante dos números acima e sem atmosfera, e devolve azimute e elevação para comparar com eles.',
}
