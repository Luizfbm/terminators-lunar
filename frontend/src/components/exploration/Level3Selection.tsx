import { useState } from 'react'
import { insideLevel3 } from './area'
import type { GlobeLanding } from '../Globe'
import './exploration.css'

export function Level3Selection({ onPick, onExit }: { onPick: (p: GlobeLanding) => void; onExit: () => void }) {
  const [lat,setLat]=useState('-89.5'), [lon,setLon]=useState('0')
  const valid = lat.trim() !== '' && lon.trim() !== '' && insideLevel3(Number(lat),Number(lon))
  return <aside className="exploration-select" lang="en">
    <span className="exploration-eyebrow">LEVEL 3 · SOUTH POLAR CORE</span>
    <h2>Choose your landing area</h2>
    <p>Click inside the blue boundary or enter coordinates. Landing centres: 87.5°–90°S.</p>
    <form onSubmit={e=>{e.preventDefault(); if(valid) onPick({lat:Number(lat),lon:Number(lon),name:null})}}>
      <div className="exploration-fields">
        <label>Latitude (°)<input name="level3-latitude" type="number" min="-90" max="-87.5" step="any" required value={lat} onChange={e=>setLat(e.target.value)} /></label>
        <label>Longitude (°)<input name="level3-longitude" type="number" min="-180" max="180" step="any" required value={lon} onChange={e=>setLon(e.target.value)} /></label>
      </div>
      {!valid && <p role="status">Use latitude −90 to −87.5 and longitude −180 to 180.</p>}
      <button type="submit" disabled={!valid}>Inspect 10 × 10 km →</button>
      <button type="button" className="exploration-secondary" onClick={onExit}>Back to Level 2</button>
    </form>
  </aside>
}
