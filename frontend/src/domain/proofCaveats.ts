/**
 * The Proof page's two summaries: where a number in the answer can be wrong, and what we have not
 * checked yet. The words live in the Proof catalogue (`proof.err.<id>.*`, `proof.todo.<id>`); this
 * module holds the rows and, for each one, where its size comes from. A row with no source for a
 * size is written without a number, never with a guessed one.
 */

/** Where a size comes from. A `check` is an id in the validations the server serves. */
export type Reference =
  | { kind: 'check'; value: string }
  | { kind: 'file'; value: string }
  | { kind: 'adr'; value: string }
  | { kind: 'paper'; value: string }

export interface CaveatRow<Id extends string> {
  id: Id
  refs: readonly Reference[]
  /**
   * Every number the row's text states, as it is written in one of its sources. The unit test
   * looks each one up in the cited checks, files and decision records, so a size cannot drift
   * away from where it came from.
   */
  figures: readonly string[]
}

const check = (value: string): Reference => ({ kind: 'check', value })
const file = (value: string): Reference => ({ kind: 'file', value })
const adr = (value: string): Reference => ({ kind: 'adr', value })
const paper = (value: string): Reference => ({ kind: 'paper', value })

export const ERROR_SOURCES = [
  {
    id: 'dem',
    refs: [file('backend/app/horizon.py'), adr('0003')],
    figures: [
      '20 m DEM up to 5 km',
      '80 m DEM up to 100 km',
      '240 m DEM up to 300 km',
      'Band("LDEM_60S_60MPP_ADJ", 60.0, 0.0, 100_000.0)',
    ],
  },
  {
    id: 'height',
    refs: [
      check('larissa-athena-horizon'),
      file('validation/athena.py'),
      adr('0003'),
      paper('Barker et al. 2021'),
    ],
    figures: ['0.3–0.5 m RMS', '1 m at 16 km is 0.004°'],
  },
  {
    id: 'small',
    refs: [check('landing-im2-athena'), check('larissa-athena-horizon')],
    figures: ['about 20 m across', 'Sun fraction at the resting point 1.00 and 1.00'],
  },
  {
    id: 'reach',
    refs: [file('backend/app/horizon.py'), file('docs/validation/wueller-2026.md')],
    figures: ['240 m DEM up to 300 km', 'shadows to 150 km', '−1.03°'],
  },
  {
    id: 'step',
    refs: [file('backend/app/constants.py'), file('backend/app/engine.py'), file('backend/app/flat.py')],
    figures: ['STEP_MINUTES = 15', 'to about one second', 'step over a short dip'],
  },
  {
    id: 'ephemeris',
    refs: [check('horizons-sun-azel'), check('horizons-earth-azel')],
    figures: ['max error 0.000001°', 'max error 0.000312°', '≤ 0.02°'],
  },
  {
    id: 'sun',
    refs: [
      file('docs/validation/wueller-2026.md'),
      check('horizons-flat-sunset'),
      check('negative-control-flat-sunset-centre'),
    ],
    figures: ['14.69 / 14.54 / 14.24', '9.11 / 8.64 / 7.81', 'max error 0.00014°', '0.262°'],
  },
  {
    id: 'earth',
    refs: [check('pgda-earth-visibility'), file('validation/pgda.py')],
    figures: ['mean difference -0.53 points', 'the mean is -5.72 points'],
  },
  {
    id: 'landing',
    refs: [file('GLOSSARY.md'), file('backend/app/scatter.py')],
    figures: ['100 m radius by default', 'DEFAULT_RADIUS_M = 250.0'],
  },
] as const satisfies readonly CaveatRow<string>[]

export const NOT_CHECKED = [
  {
    id: 'ladder',
    refs: [file('backend/app/horizon.py'), file('backend/scripts/build_catalog.py'), adr('0003'), paper('Barker et al. 2021')],
    figures: ['LDEM_80S_20MPP_ADJ', '16 x 16 km 5 m DEMs', 'about 90 % interpolated'],
  },
  {
    id: 'lola',
    refs: [check('larissa-athena-horizon'), check('slope-synthetic-plane')],
    figures: ["errors common to LOLA don't show", 'Arithmetic on synthetic DEMs only'],
  },
  {
    id: 'instants',
    refs: [check('landing-blue-ghost-1'), check('landing-chandrayaan-3'), check('landing-im2-athena')],
    figures: [
      "'just over 5 hours into the lunar night'",
      'it is not a comparison with a measured instant',
      'the end of the mission was not a terrain Sunset',
    ],
  },
  {
    id: 'wueller',
    refs: [check('wueller2026-sunlit-days'), file('docs/validation/wueller-2026.md')],
    figures: ['75 of 130 Sites within 1 day', '40 Sites are off by more than 1 day'],
  },
  {
    id: 'ridges',
    refs: [check('pgda-sun-visibility'), check('pgda-earth-visibility')],
    figures: ['RMSE 25.40', 'over 18 points', 'At the surface (0 m)'],
  },
  {
    id: 'dsn',
    refs: [check('horizons-dsn-elevation')],
    figures: ['no antenna schedule, no link budget', 'only the three 70 m antennas'],
  },
  {
    id: 'panels',
    refs: [check('eduardo-panel-incidence'), check('horizons-sun-distance-factor')],
    figures: ['No thermal model, no tracking error', 'no heat, constant load'],
  },
  {
    id: 'eclipse',
    refs: [check('eclipse-2025-local-contacts')],
    figures: ['No refraction by the Earth\'s atmosphere'],
  },
] as const satisfies readonly CaveatRow<string>[]

export type ErrorSourceId = (typeof ERROR_SOURCES)[number]['id']
export type NotCheckedId = (typeof NOT_CHECKED)[number]['id']
