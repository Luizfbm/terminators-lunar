import { useEffect, useRef, useState } from 'react'
import type { VisibilityResult } from '../../api/client'
import { LadderPanel } from '../LadderPanel'
import { MissPanel } from '../phase4/miss/MissPanel'
import { useRadius, useScatter } from '../phase4/miss/useMiss'
import { DsnLink } from '../phase4/dsn/DsnLink'
import './precision.css'
import { RoutePanel } from './RoutePanel'
import type { Vehicle } from '../vehiclePicker/vehicles'

function LandingPrecision({ result }: { result: VisibilityResult }) {
  const radius = useRadius()
  const scatter = useScatter(result, radius[0])
  return <MissPanel result={result} radius={radius} scatter={scatter} />
}

/** Existing backend analyses, requested only when their section is opened. No route model. */
export function PrecisionPanel({ result, onClose, onProof, vehicle }: { result: VisibilityResult; vehicle?: Vehicle | null; onClose: () => void; onProof: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [section, setSection] = useState<'resolution' | 'landing' | 'communication' | 'routes'>('resolution')
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => {
      element?.close()
      // React removes the dialog after cleanup; restore focus once that removal has finished.
      queueMicrotask(() => { if (!element?.open && opener?.isConnected) opener.focus() })
    }
  }, [])
  return (
    <dialog ref={dialog} className="precision" aria-labelledby="precision-title" onCancel={onClose}>
      <header className="precision__head">
        <h2 id="precision-title">Level 3 · Precision</h2>
        <button type="button" onClick={onClose} aria-label="Close precision analysis">Close</button>
      </header>
      <p>{result.query.site.name} · {result.query.site.latitude_deg.toFixed(4)}°, {result.query.site.longitude_deg.toFixed(4)}°</p>
      <p>{result.query.start} — {result.query.end}</p>
      <p>Inspect how terrain resolution, landing position and communication geometry affect this Site and Window.</p>
      <nav className="precision__sections" aria-label="Precision analyses">
        <button type="button" aria-pressed={section === 'resolution'} onClick={() => setSection('resolution')}>Resolution</button>
        <button type="button" aria-pressed={section === 'landing'} onClick={() => setSection('landing')}>Landing position & slope</button>
        <button type="button" aria-pressed={section === 'communication'} onClick={() => setSection('communication')}>Communication</button>
        <button type="button" aria-pressed={section === 'routes'} onClick={() => setSection('routes')}>Rover routes</button>
      </nav>
      {section === 'routes' && <RoutePanel result={result} vehicle={vehicle} />}
      {section === 'resolution' && <LadderPanel result={result} />}
      {section === 'landing' && <LandingPrecision result={result} />}
      {section === 'communication' && <DsnLink result={result} />}
      <p className="precision__limit">Site analyses and route scenarios use measured terrain. Route scenarios are not validated vehicle safety assessments. Finer terrain does not by itself establish greater accuracy.</p>
      <button type="button" onClick={onProof}>View validation evidence</button>
    </dialog>
  )
}
