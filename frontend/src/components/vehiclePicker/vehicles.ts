/*
 * The four lunar rovers of the picker, with their figures.
 *
 * Source: nasa-2026 (C:\Users\Administrador\projects\nasa-2026), file src/cockpit_missao_lunar.html,
 * commit 9c923e0: `const ROVERS` at about lines 5598–5663 (the lrv, viper, ltv and mapp entries; the
 * Mars rovers are left out) and `roverDarkHours` just after it (about line 5664). Every number here
 * is copied as it is there, not rounded. Each rover's `source` text (strings.ts) is that entry's
 * `src`, and its description is its `shortDesc`. The fields listed in `estimated` are that entry's
 * `est`: the picker shows them with a *.
 *
 * The choice of rover changes no calculation yet, and the backend gets no battery data: these
 * figures are only shown.
 */
import type { RoverModel } from './rover3d'
import type { en } from './strings'

type StringKey = keyof typeof en

/** The figures of a rover that can be an estimate rather than a published value. */
export type RoverFigure = 'massKg' | 'batteryWh' | 'solarW' | 'rtgW' | 'powerShadowW' | 'mastHeightM' | 'slopeLimitDeg'

/** A rover the visitor can land with. `tint` colours the generic SVG drawn when there is no 3D. */
export interface Vehicle {
  id: string
  model: RoverModel
  name: string
  short: string
  massKg: number
  batteryWh: number
  solarW: number
  rtgW: number
  powerShadowW: number
  mastHeightM: number
  slopeLimitDeg: number
  estimated: readonly RoverFigure[]
  description: StringKey
  source: StringKey
  tint: string
}

export const VEHICLES: readonly Vehicle[] = [
  {
    id: 'lrv',
    model: 'lrv',
    name: 'Lunar Roving Vehicle (Apollo)',
    short: 'LRV · APOLLO 15–17',
    massKg: 210,
    batteryWh: 8712,
    solarW: 0,
    rtgW: 0,
    powerShadowW: 350,
    mastHeightM: 1.14,
    slopeLimitDeg: 15,
    estimated: ['powerShadowW'],
    description: 'vehiclePicker.rover.lrv.desc',
    source: 'vehiclePicker.rover.lrv.source',
    tint: '#e6dccb',
  },
  {
    id: 'viper',
    model: 'viper',
    name: 'VIPER (NASA)',
    short: 'VIPER',
    massKg: 430,
    batteryWh: 5420,
    solarW: 450,
    rtgW: 0,
    powerShadowW: 95,
    mastHeightM: 2.45,
    slopeLimitDeg: 15,
    estimated: [],
    description: 'vehiclePicker.rover.viper.desc',
    source: 'vehiclePicker.rover.viper.source',
    tint: '#e9e9ea',
  },
  {
    id: 'ltv',
    model: 'ltv',
    name: 'Lunar Terrain Vehicle (Artemis)',
    short: 'LTV · ARTEMIS',
    massKg: 500,
    batteryWh: 6650,
    solarW: 650,
    rtgW: 0,
    powerShadowW: 110,
    mastHeightM: 2.0,
    slopeLimitDeg: 18,
    estimated: ['massKg', 'batteryWh', 'solarW', 'powerShadowW', 'mastHeightM'],
    description: 'vehiclePicker.rover.ltv.desc',
    source: 'vehiclePicker.rover.ltv.source',
    tint: '#cfd8e6',
  },
  {
    id: 'mapp',
    model: 'mapp',
    name: 'Lunar Outpost MAPP',
    short: 'MAPP · LUNAR OUTPOST',
    massKg: 10,
    batteryWh: 420,
    solarW: 180,
    rtgW: 0,
    powerShadowW: 120,
    mastHeightM: 0.6,
    slopeLimitDeg: 14,
    estimated: ['massKg', 'batteryWh', 'solarW', 'powerShadowW', 'mastHeightM'],
    description: 'vehiclePicker.rover.mapp.desc',
    source: 'vehiclePicker.rover.mapp.source',
    tint: '#d9d2c4',
  },
]

/**
 * Hours the battery lasts in the dark, as nasa-2026's `roverDarkHours`: the battery over the power
 * drawn in shadow less what an RTG gives back. Infinity when the RTG covers it all.
 */
export function darkHours(v: Vehicle): number {
  const net = v.powerShadowW - v.rtgW
  return net <= 0 ? Infinity : v.batteryWh / net
}

/** `n` folded into 0..length-1, so stepping left from the first vehicle goes round to the last. */
export const wrapIndex = (n: number, length: number): number => ((n % length) + length) % length

/** VIPER, the south-pole ice rover, is in focus first. */
export const DEFAULT_VEHICLE_INDEX = 1
