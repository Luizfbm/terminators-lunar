import { useEffect, useRef, useState } from 'react'
import type { GlobeLanding } from '../Globe'
import { VEHICLES, type Vehicle } from '../vehiclePicker/vehicles'
import { checkPickWindow, inputBounds, type Coverage } from '../vehiclePicker/pickWindow'
import { fetchArea, type LandingArea } from './area'
import { TerrainCurtain } from './TerrainCurtain'
import './exploration.css'

export interface ExplorationPick { area: LandingArea; vehicle: Vehicle; heading: number; start: string; end: string }
export function LandingInspector({ place, coverage, initialStart, initialEnd, initialVehicle, onClose, onConfirm }: {
  place:GlobeLanding;coverage:Coverage;initialStart:string;initialEnd:string;initialVehicle:Vehicle|null
  onClose:()=>void;onConfirm:(pick:ExplorationPick)=>void
}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [loaded,setLoaded]=useState<{key:string;area:LandingArea|null;error:string|null}|null>(null),[attempt,retry]=useState(0)
  // The answer belongs to the place and attempt it was asked for; any other key is still loading.
  const key=`${place.lat},${place.lon},${attempt}`
  const area=loaded?.key===key?loaded.area:null, error=loaded?.key===key?loaded.error:null
  const [vehicle,setVehicle]=useState(initialVehicle??VEHICLES[1]),[heading,setHeading]=useState('0')
  const [start,setStart]=useState(initialStart),[end,setEnd]=useState(initialEnd)
  const bounds=inputBounds(coverage), windowError=checkPickWindow(start,end,coverage)
  const validHeading=heading.trim()!=='' && Number.isFinite(Number(heading)) && Number(heading)>=0 && Number(heading)<360
  useEffect(()=>{
    const el=dialog.current, opener=document.activeElement as HTMLElement|null
    el?.showModal()
    return ()=>{el?.close();queueMicrotask(()=>{if(opener?.isConnected)opener.focus()})}
  },[])
  useEffect(()=>{
    const controller=new AbortController()
    void fetchArea(place.lat,place.lon,controller.signal).then(result=>{if(!controller.signal.aborted)setLoaded({key,area:result,error:null})})
      .catch(reason=>{if(!controller.signal.aborted)setLoaded({key,area:null,error:reason instanceof Error?reason.message:'Could not load terrain.'})})
    return ()=>controller.abort()
  },[place.lat,place.lon,key])
  return <dialog ref={dialog} className="landing-inspector" aria-labelledby="landing-inspector-title" lang="en" onCancel={onClose}>
    <header><div><span className="exploration-eyebrow">LEVEL 3 · PREPARE TO LAND</span><h2 id="landing-inspector-title">Your 10 × 10 km landing area</h2></div><button type="button" onClick={onClose} aria-label="Back to landing map">← Back</button></header>
    <p>{place.name??'South polar surface'} · {place.lat.toFixed(5)}°, {place.lon.toFixed(5)}°</p>
    <div className="landing-inspector__body">
      <section aria-label="Landing area comparison">
        {!area&&!error&&<p role="status" className="exploration-loading">Loading measured lunar terrain…</p>}
        {error&&<div role="alert"><p>{error}</p><button onClick={()=>retry(n=>n+1)}>Try again</button></div>}
        {area&&<TerrainCurtain area={area} heading={validHeading?Number(heading):0} />}
        <p className="exploration-note">Before / After compares terrain detail, not dates. Same area, fixed inspection light.</p>
        {area&&<details><summary>Terrain sources</summary><p>{area.before.dem.product} → {area.after.dem.product}. Native elevation pixels; no generated terrain. Map distances use the south polar projection.</p></details>}
      </section>
      <form onSubmit={e=>{e.preventDefault();if(area&&!windowError&&validHeading)onConfirm({area,vehicle,heading:Number(heading),start,end})}}>
        <label>Rover<select name="exploration-rover" value={vehicle.id} onChange={e=>setVehicle(VEHICLES.find(v=>v.id===e.target.value)!)}>{VEHICLES.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <p className="exploration-note">Explore from behind your rover. Turn and drive with the arrow keys or on-screen controls.</p>
        <label>Landing heading (°)<input name="landing-heading" type="number" min="0" max="359.99" step="any" required value={heading} onChange={e=>setHeading(e.target.value)} /></label>
        <p className="exploration-note">0° North · 90° East · 180° South · 270° West</p>
        <label>Start (local time)<input name="exploration-start" type="datetime-local" required min={bounds.min} max={bounds.max} value={start} onChange={e=>setStart(e.target.value)} /></label>
        <label>End (local time)<input name="exploration-end" type="datetime-local" required min={bounds.min} max={bounds.max} value={end} onChange={e=>setEnd(e.target.value)} /></label>
        {windowError&&<p role="status">Choose a valid period within coverage, up to {Math.floor(coverage.max_duration_hours/24)} days.</p>}
        <button className="exploration-land" type="submit" disabled={!area||!!windowError||!validHeading}>Land & explore →</button>
      </form>
    </div>
  </dialog>
}
