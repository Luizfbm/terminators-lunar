import type { VisibilityResult } from '../../api/client'
import type { Vehicle } from '../vehiclePicker/vehicles'
import { readingAtCursor } from './batteryAtCursor'
import { useTimelineText, useVehicleEnergy } from './TimelineReadouts'

/** Shares the cached backend answer with the timeline; never invents charge while loading. */
export function BatteryGauge({ result, vehicle, cursorMs }: { result: VisibilityResult; vehicle: Vehicle; cursorMs: number }) {
  const { state } = useVehicleEnergy(result.query, vehicle)
  const text = useTimelineText()
  const reading = state.status === 'ready' ? readingAtCursor(result.timeline.samples, state.data,
    Date.parse(result.query.start), Date.parse(result.query.end), cursorMs) : null
  const label = reading ? text.battery(reading)[0] : state.status === 'error' ? 'Battery unavailable' : 'Loading battery…'
  return <div className="battery-gauge" data-state={reading?.state ?? 'unknown'} role="img" aria-label={label} title={label}>
    <span className="battery-gauge__case" aria-hidden="true"><i style={{ width: `${reading?.percent ?? 0}%` }} /></span>
    <span>{reading ? `${reading.percent}%` : '—'}</span>
    <span className="battery-gauge__state">{reading?.state ?? (state.status === 'error' ? 'unavailable' : 'loading')}</span>
  </div>
}
