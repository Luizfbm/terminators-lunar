import { useEffect, useMemo, useRef, useState } from 'react'
import { heightGridOf } from '../../domain/terrainHeights'
import { areaPoint, type LandingArea } from './area'

export function relief(area: LandingArea, which: 'before' | 'after') {
  const grid = heightGridOf(area[which])!.heights
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=512
  const ctx=canvas.getContext('2d')!
  const image=ctx.createImageData(512,512)
  const span=grid.at65535M-grid.at0M
  const height=(c:number,r:number)=>grid.at0M+grid.data[Math.max(0,Math.min(grid.size-1,r))*grid.size+Math.max(0,Math.min(grid.size-1,c))]/65535*span
  for(let r=0;r<512;r++) for(let c=0;c<512;c++) {
    const point=areaPoint(area,(c+.5)/512,(r+.5)/512)
    const col=Math.round((point.x-grid.xMinM)/grid.metresPerPixel-.5)
    const row=Math.round((grid.yMaxM-point.y)/grid.metresPerPixel-.5)
    const dx=(height(col+1,row)-height(col-1,row))/(2*grid.metresPerPixel)
    const dy=(height(col,row-1)-height(col,row+1))/(2*grid.metresPerPixel)
    // Common fixed inspection light, only to reveal relief, not a Sun/illumination prediction.
    const shade=Math.max(0,(-dx*.5-dy*.5+.7071)/Math.hypot(dx,dy,1))
    const value=40+195*shade, i=(r*512+c)*4
    image.data.set([value,value,value,255],i)
  }
  ctx.putImageData(image,0,0)
  return canvas
}

export function TerrainCurtain({ area, heading }: { area:LandingArea; heading:number }) {
  const [split,setSplit]=useState(50)
  const canvas=useRef<HTMLCanvasElement>(null)
  const images=useMemo(()=>({before:relief(area,'before'),after:relief(area,'after')}),[area])
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d'); if(!ctx) return
    ctx.drawImage(images.after,0,0)
    ctx.save();ctx.beginPath();ctx.rect(0,0,512*split/100,512);ctx.clip();ctx.drawImage(images.before,0,0);ctx.restore()
    ctx.strokeStyle='#8de1ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(512*split/100,0);ctx.lineTo(512*split/100,512);ctx.stroke()
    ctx.save();ctx.translate(256,256);ctx.rotate((area.site.longitude_deg+heading)*Math.PI/180)
    ctx.fillStyle='#8de1ff';ctx.strokeStyle='#111';ctx.lineWidth=2
    ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(8,9);ctx.lineTo(0,5);ctx.lineTo(-8,9);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()
  },[images,split,heading,area])
  return <div className="terrain-curtain">
    <div className="terrain-curtain__labels"><span>Before · {area.before.dem.resolution_m} m</span><span>After · {area.after.dem.resolution_m} m</span></div>
    <canvas ref={canvas} width="512" height="512" role="img" aria-label="Co-registered 10 by 10 kilometre terrain comparison and landing direction" />
    <label>Slide to compare<input name="terrain-comparison" type="range" min="0" max="100" value={split} onChange={e=>setSplit(Number(e.target.value))} /></label>
    <p>10 × 10 km · arrow = landing point & heading</p>
  </div>
}
