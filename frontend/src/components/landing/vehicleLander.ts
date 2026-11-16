/**
 * The rover chosen before the landing, as the lander `/visibility/energy` is asked about. Its figures
 * are passed as they are (vehicles.ts); the backend follows the Charge.
 */
import type { LanderDraft } from '../phase4/battery/settings'
import type { RoverFigure, Vehicle } from '../vehiclePicker/vehicles'

/** The figures the Battery row is built from, in the order the note names them. */
export const BATTERY_FIGURES = ['batteryWh', 'solarW', 'powerShadowW'] as const satisfies readonly RoverFigure[]
export type BatteryFigure = (typeof BATTERY_FIGURES)[number]

const NO_LANDER: LanderDraft = { panel: '', load: '', battery: '' }

/**
 * The three battery fields for the rover: panel power = `solarW`, load = `powerShadowW`, capacity =
 * `batteryWh`. Empty with no rover, which `useEnergy` reads as nothing to ask.
 */
export function vehicleDraft(vehicle: Vehicle | null | undefined): LanderDraft {
  if (!vehicle) return NO_LANDER
  return { panel: String(vehicle.solarW), load: String(vehicle.powerShadowW), battery: String(vehicle.batteryWh) }
}

/** Which of those figures are an estimate for this rover: the Battery row gets a * when any is. */
export function estimatedBatteryFigures(vehicle: Vehicle): BatteryFigure[] {
  return BATTERY_FIGURES.filter((figure) => vehicle.estimated.includes(figure))
}
