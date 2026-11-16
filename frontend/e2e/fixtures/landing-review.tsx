import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../src/i18n/I18nContext'
import { TimeStrip } from '../../src/components/TimeStrip'
import { PrecisionPanel } from '../../src/components/precision/PrecisionPanel'
import { VEHICLES } from '../../src/components/vehiclePicker/vehicles'
import type { VisibilityResult } from '../../src/api/client'
import example from './visibility-cr01.example.json'
import '../../src/index.css'

const result = example.value as VisibilityResult
function Harness() {
  const [cursor, setCursor] = useState(Date.parse(result.query.start))
  const [vehicle, setVehicle] = useState(VEHICLES.find((v) => v.id === 'viper')!)
  const [precision, setPrecision] = useState(false)
  return <I18nProvider locale="en" language="en-US">
    <div style={{ padding: 24 }}>
      <button onClick={() => setPrecision(true)}>Open precision</button>
      <button onClick={() => setVehicle(VEHICLES.find((v) => v.id === 'lrv')!)}>Choose LRV</button>
      <output id="cursor-value">{cursor}</output>
      <TimeStrip key={vehicle.id} result={result} vehicle={vehicle} cursorMs={cursor} playing={false} shortShadowMaxHours={2} onCursor={setCursor} onPlay={() => {}} />
      {precision && <PrecisionPanel result={result} onClose={() => setPrecision(false)} onProof={() => setPrecision(false)} />}
    </div>
  </I18nProvider>
}
createRoot(document.getElementById('root')!).render(<Harness />)
