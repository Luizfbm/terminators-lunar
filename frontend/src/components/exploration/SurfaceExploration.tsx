import { solarPathDirections } from '../../domain/solarPath'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { ownRenderer, releaseRenderer } from '../rendererLifetime'
import { createRoverFleet } from '../vehiclePicker/roverModels'
import { GRAIN_PX, GRAIN_M, GRAIN_DEPTH, grainTexels } from '../../domain/nearGround'
import { regolithMaterial, SHADOW_FLOOR } from '../regolith'
import { LIGHT_GRAPHICS } from '../../domain/graphicsMode'
import { sampleAt } from '../../domain/sky'
import { earthAttitude, earthNorthAt, earthRoll, subLunarPoint } from '../../domain/earthFace'
import { createEarthMaterial } from '../earthMaterial'
import { direction, discScale, ballScale } from '../../domain/skyScene'
import type { VisibilityResult } from '../../api/client'
import type { ExplorationPick } from './LandingInspector'
import { drive, surfaceGeometry } from './area'
import { relief } from './TerrainCurtain'

/** Manual DEM exploration. Scientific time/visibility stays referenced to the landing site. */
export function SurfaceExploration({ pick, result, cursorMs, paused=false }: {
  pick:ExplorationPick;result:VisibilityResult;cursorMs:number;paused?:boolean
}) {
  const host=useRef<HTMLDivElement>(null), minimap=useRef<HTMLCanvasElement>(null), readout=useRef<HTMLOutputElement>(null)
  const lookAtBody=useRef<((body:'sun'|'earth'|null)=>void)|null>(null)
  const keys=useRef(new Set<string>()), reset=useRef<(()=>void)|null>(null)
  const latest=useRef({result,cursorMs,paused}), guides=useRef<Partial<Record<'sun'|'earth',HTMLButtonElement>>>({})
  const [failed,setFailed]=useState(false)
  useEffect(()=>{latest.current={result,cursorMs,paused};if(paused)keys.current.clear()},[result,cursorMs,paused])
  useEffect(()=>{
    const element=host.current;if(!element)return
    const data=surfaceGeometry(pick.area)
    let renderer:THREE.WebGLRenderer
    try{renderer=new THREE.WebGLRenderer({antialias:!LIGHT_GRAPHICS});ownRenderer(renderer)}catch{setFailed(true);return}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,LIGHT_GRAPHICS?1:1.5))
    renderer.setClearColor('#030508');element.appendChild(renderer.domElement)
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Lunar rover surface. Arrow keys or W A S D to drive.')
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,200000)
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setIndex(new THREE.BufferAttribute(data.indices,1));geometry.computeVertexNormals()
    // The same visual dust grain as Level 2: colour only, never invented elevation.
    const grainPixels=new Uint8Array(GRAIN_PX*GRAIN_PX*4)
    grainTexels().forEach((value,i)=>{const byte=Math.round(value*255);grainPixels.set([byte,byte,byte,255],i*4)})
    const grain=new THREE.DataTexture(grainPixels,GRAIN_PX,GRAIN_PX,THREE.RGBAFormat)
    grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.magFilter=THREE.LinearFilter;grain.minFilter=THREE.LinearMipmapLinearFilter;grain.generateMipmaps=true;grain.needsUpdate=true
    const uv=new Float32Array(data.positions.length/3*2)
    for(let i=0;i<data.positions.length/3;i++){uv[i*2]=data.positions[i*3]/(GRAIN_PX*GRAIN_M);uv[i*2+1]=data.positions[i*3+2]/(GRAIN_PX*GRAIN_M)}
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2))
    const material=regolithMaterial({color:new THREE.Color('#aaa7a1').multiplyScalar(1/(1-GRAIN_DEPTH/2)),map:grain,side:THREE.DoubleSide})
    scene.add(new THREE.Mesh(geometry,material))
    const fleet=createRoverFleet(),rover=fleet.models[pick.vehicle.model]
    // Front is +Z, as in the cockpit. Keep the original model dimensions, not the picker's normalized scale.
    const bbox=new THREE.Box3().setFromObject(rover)
    const roverGroup=new THREE.Group();rover.position.y=-bbox.min.y;roverGroup.add(rover);scene.add(roverGroup)
    const light=new THREE.DirectionalLight(0xffffff,2.2)
    scene.add(light,light.target,new THREE.AmbientLight(0xffffff,SHADOW_FLOOR))
    const earthMaterial=createEarthMaterial()
    const bodies={sun:new THREE.Mesh(new THREE.CircleGeometry(1,48),new THREE.MeshBasicMaterial({color:'#fff3c3',side:THREE.DoubleSide})),
      earth:new THREE.Mesh(new THREE.SphereGeometry(1,40,24),earthMaterial)}
    scene.add(bodies.sun,bodies.earth)
    const pathGeometry=new THREE.BufferGeometry(),pathMaterial=new THREE.PointsMaterial({color:'#f5bd3a',size:2,sizeAttenuation:false,transparent:true,opacity:.5})
    const sunPath=new THREE.Points(pathGeometry,pathMaterial);scene.add(sunPath)
    let pathResult:VisibilityResult|null=null
    const starPositions=new Float32Array(1800)
    // A deterministic decorative star field; not a stellar catalogue.
    for(let i=0;i<600;i++){const a=i*2.3999632297,z=1-2*(i+.5)/600,r=Math.sqrt(1-z*z);starPositions.set([r*Math.cos(a)*80000,z*80000,r*Math.sin(a)*80000],i*3)}
    const starsGeometry=new THREE.BufferGeometry();starsGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3))
    const starsMaterial=new THREE.PointsMaterial({color:'#b6c2ce',size:1,sizeAttenuation:false});scene.add(new THREE.Points(starsGeometry,starsMaterial))
    let position={...data.centre,heading:pick.heading},raf=0,last=performance.now(),lastHud=0,gone=false
    let earthMap:THREE.Texture|null=null, earthLean:number|null=null
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}earth_2k.jpg`,texture=>{
      if(gone){texture.dispose();return}
      earthMap=texture;texture.colorSpace=THREE.SRGBColorSpace
      earthMaterial.uniforms.map.value=texture;earthMaterial.uniforms.mapped.value=1
    })
    const began=last,still=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lookingAt:'sun'|'earth'|null=null
    lookAtBody.current=body=>{lookingAt=body}
    let orbit=0,elevation=6,drag:{x:number;y:number}|null=null
    const trail:{x:number;y:number}[]=[{...data.centre}]
    const miniImage=relief(pick.area,'after')
    const resetPosition=()=>{position={...data.centre,heading:pick.heading};lookingAt=null;orbit=0;elevation=6;trail.splice(0,trail.length,{...data.centre});keys.current.clear()}
    reset.current=resetPosition
    const movementKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'])
    const keyDown=(event:KeyboardEvent)=>{
      if(latest.current.paused||!(event.target instanceof HTMLElement)||event.target.closest('input,select,textarea,dialog'))return
      if(movementKeys.has(event.code)){lookingAt=null;event.preventDefault();keys.current.add(event.code)}
    }
    const keyUp=(event:KeyboardEvent)=>{keys.current.delete(event.code)}
    const clear=()=>{keys.current.clear();drag=null}
    const down=(e:PointerEvent)=>{lookingAt=null;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus()}
    const move=(e:PointerEvent)=>{if(!drag)return;orbit-=(e.clientX-drag.x)*.008;elevation=Math.max(2,Math.min(80,elevation+(e.clientY-drag.y)*.1));drag={x:e.clientX,y:e.clientY}}
    const up=()=>{drag=null}
    const lost=(e:Event)=>{e.preventDefault();gone=true;cancelAnimationFrame(raf);clear();setFailed(true)}
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('webglcontextlost',lost)
    window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear)
    const resize=()=>{const w=Math.max(1,element.clientWidth),h=Math.max(1,element.clientHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()}
    const observer=new ResizeObserver(resize);observer.observe(element);resize()
    const hereVector=new THREE.Vector3(),forward=new THREE.Vector3(),normal=new THREE.Vector3(),right=new THREE.Vector3(),basis=new THREE.Matrix4()
    const tick=(now:number)=>{
      if(gone)return;raf=requestAnimationFrame(tick)
      const dt=Math.min(.05,(now-last)/1000);last=now
      const pressed=(a:string,b:string)=>Number(keys.current.has(a)||keys.current.has(b))
      if(!latest.current.paused&&!document.hidden){
        const turn=(pressed('ArrowRight','KeyD')-pressed('ArrowLeft','KeyA'))*55*dt
        const fast=keys.current.has('ShiftLeft')||keys.current.has('ShiftRight')
        const dist=(pressed('ArrowUp','KeyW')-pressed('ArrowDown','KeyS'))*(fast?40:8)*dt
        if(turn||dist)lookingAt=null
        position=drive(position,turn,dist,pick.area)
      }
      hereVector.set(...data.at(position.x,position.y))
      const lon=Math.hypot(position.x,position.y)<.001?pick.area.site.longitude_deg*Math.PI/180:Math.atan2(position.x,position.y)
      const angle=lon+position.heading*Math.PI/180
      forward.set(...data.at(position.x+Math.sin(angle),position.y+Math.cos(angle))).sub(hereVector).normalize()
      const vx=new THREE.Vector3(...data.at(position.x+1,position.y)).sub(hereVector)
      const vy=new THREE.Vector3(...data.at(position.x,position.y+1)).sub(hereVector)
      normal.crossVectors(vx,vy).normalize();if(normal.y<0)normal.negate()
      right.crossVectors(normal,forward).normalize();normal.crossVectors(forward,right).normalize()
      basis.makeBasis(right,normal,forward);roverGroup.quaternion.setFromRotationMatrix(basis);roverGroup.position.copy(hereVector)
      const descent=still?0:Math.max(0,1-(now-began)/1100)
      const back=forward.clone().applyAxisAngle(new THREE.Vector3(0,1,0),orbit).multiplyScalar(-12-descent*70)
      camera.position.copy(hereVector).add(back);camera.position.y+=elevation+descent*100
      // Keep the camera above the nearby measured surface when looking uphill.
      const near=drive(position,180-orbit*180/Math.PI,12,pick.area)
      camera.position.y=Math.max(camera.position.y,data.at(near.x,near.y)[1]+2)
      camera.lookAt(hereVector.clone().add(new THREE.Vector3(0,1.2,0)))
      if(pathResult!==latest.current.result){
        pathResult=latest.current.result
        const dots=solarPathDirections(pathResult.timeline.samples).flatMap(point=>point.map(value=>value*100000))
        pathGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));pathGeometry.computeBoundingSphere()
      }
      const sample=sampleAt(latest.current.result.timeline.samples,latest.current.cursorMs)
      if(sample){
        if(lookingAt){
          const body=sample[lookingAt]
          camera.position.copy(hereVector).add(new THREE.Vector3(0,Math.max(2,pick.vehicle.mastHeightM),0))
          camera.lookAt(camera.position.clone().add(new THREE.Vector3(...direction(body.azimuth_deg,body.elevation_deg)).multiplyScalar(1000)))
        }
        const sunDirection=new THREE.Vector3(...direction(sample.sun.azimuth_deg,sample.sun.elevation_deg))
        earthMaterial.uniforms.sunDirection.value.copy(sunDirection)
        light.position.copy(sunDirection).multiplyScalar(100000);light.intensity=2.2*sample.sun.fraction
        for(const body of ['sun','earth'] as const){
          const value=sample[body],mesh=bodies[body],radius=value.angular_radius_deg
          mesh.visible=radius!==undefined
          mesh.position.copy(camera.position).add(new THREE.Vector3(...direction(value.azimuth_deg,value.elevation_deg)).multiplyScalar(100000))
          if(radius!==undefined)mesh.scale.setScalar(body==='sun'?discScale(radius,100000):ballScale(radius,100000))
          if(body==='sun')mesh.lookAt(camera.position)
          else {
            const sunSeen={azimuthDeg:sample.sun.azimuth_deg,elevationDeg:sample.sun.elevation_deg}
            const earthSeen={azimuthDeg:sample.earth.azimuth_deg,elevationDeg:sample.earth.elevation_deg}
            const north=earthNorthAt(latest.current.cursorMs,sunSeen,earthSeen)
            if(north)earthLean=earthRoll(north,earthSeen)
            const back=new THREE.Vector3(...direction(earthSeen.azimuthDeg,earthSeen.elevationDeg)).negate()
            const [x,y,z]=earthAttitude(subLunarPoint(latest.current.cursorMs),earthLean??180,[back.x,back.y,back.z])
            mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x),new THREE.Vector3(...y),new THREE.Vector3(...z)))
          }
          const guide=guides.current[body];if(guide){
            const screen=mesh.position.clone().project(camera)
            const visible=screen.z<1&&screen.z>-1&&Math.abs(screen.x)<.9&&Math.abs(screen.y)<.85
            const hiddenAtLanding=body==='sun'?sample.sun.fraction===0:!sample.earth.visible
            guide.hidden=visible&&!hiddenAtLanding;guide.textContent=`${body==='sun'?'Sun':'Earth'} ${screen.x<0?'←':'→'}${hiddenAtLanding?' · below horizon at landing':''}`
          }
        }
      }
      sunPath.position.copy(camera.position)
      renderer.render(scene,camera)
      canvas.dataset.ready='true';canvas.dataset.landed=String(descent===0);canvas.dataset.heading=position.heading.toFixed(2);canvas.dataset.roverX=position.x.toFixed(2);canvas.dataset.roverY=position.y.toFixed(2)
      if(now-lastHud>120){
        lastHud=now
        const moved=Math.hypot(position.x-data.centre.x,position.y-data.centre.y)
        if(readout.current)readout.current.textContent=`Heading ${position.heading.toFixed(0)}° · ${moved.toFixed(0)} m from landing`
        const lastTrail=trail[trail.length-1];if(Math.hypot(position.x-lastTrail.x,position.y-lastTrail.y)>5){trail.push({x:position.x,y:position.y});if(trail.length>1024)trail.shift()}
        const ctx=minimap.current?.getContext('2d');if(ctx){
          ctx.drawImage(miniImage,0,0,200,200);const b=pick.area.bounds
          const xy=(p:{x:number;y:number})=>[(p.x-b.x_min_m)/10000*200,(b.y_max_m-p.y)/10000*200]
          ctx.strokeStyle='#90ddff';ctx.lineWidth=2;ctx.beginPath();trail.forEach((p,i)=>{const [x,y]=xy(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.stroke()
          ctx.fillStyle='white';ctx.fillRect(97,97,6,6)
          ctx.save();ctx.translate(...xy(position) as [number,number]);ctx.rotate(angle);ctx.fillStyle='#8de1ff';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore()
        }
      }
    }
    raf=requestAnimationFrame(tick)
    return ()=>{
      gone=true;cancelAnimationFrame(raf);clear();reset.current=null;lookAtBody.current=null;observer.disconnect()
      window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear)
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('webglcontextlost',lost)
      pathGeometry.dispose();pathMaterial.dispose();
      geometry.dispose();material.dispose();grain.dispose();fleet.dispose();earthMap?.dispose();starsGeometry.dispose();starsMaterial.dispose()
      Object.values(bodies).forEach(b=>{b.geometry.dispose();b.material.dispose()});releaseRenderer(renderer);canvas.remove()
    }
  },[pick])
  return <div className="surface-exploration" lang="en">
    <div ref={host} className="surface-exploration__canvas" />
    <div className="surface-exploration__info"><span className="exploration-eyebrow">LEVEL 3 · ON THE SURFACE</span><h2>{pick.vehicle.short}</h2>
      <output ref={readout}>Heading {pick.heading}°</output><p>10 × 10 km · native {pick.area.after.dem.resolution_m} m terrain · vertical scale 1:1</p><p>Sun & Earth reference: landing location.</p></div>
    <canvas ref={minimap} width="200" height="200" className="surface-exploration__minimap" aria-label="Landing area, rover direction and travelled trail" />
    {(['sun','earth'] as const).map((body,i)=><button key={body} ref={el=>{if(el)guides.current[body]=el;else delete guides.current[body]}} className="surface-exploration__guide" style={{position:'absolute',right:24,top:200+i*38}} onClick={()=>{
      lookAtBody.current?.(body)
      host.current?.querySelector('canvas')?.focus()
    }}>{body==='sun'?'Sun':'Earth'} →</button>)}
    <p className="surface-exploration__help">Drag to look around. WASD / arrows to drive; Shift to move faster. Visual exploration, not a vehicle dynamics simulation.</p>
    <div className="surface-exploration__controls" role="group" aria-label="Rover controls">
      {([['ArrowUp','↑','Drive forward'],['ArrowLeft','↶','Turn left'],['ArrowDown','↓','Reverse'],['ArrowRight','↷','Turn right']] as const).map(([key,label,name])=><button key={key} type="button" aria-label={name} disabled={failed||paused}
        onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.add(key)}} onPointerUp={()=>keys.current.delete(key)} onPointerCancel={()=>keys.current.delete(key)} onLostPointerCapture={()=>keys.current.delete(key)}
        onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();keys.current.add(key)}}} onKeyUp={()=>keys.current.delete(key)} onBlur={()=>keys.current.delete(key)}>{label}</button>)}
      <button type="button" onClick={()=>{lookAtBody.current?.(null)}}>Follow rover</button>
      <button type="button" onClick={()=>reset.current?.()}>Reset to landing</button>
    </div>
    {failed&&<p role="alert" style={{position:'absolute',left:24,top:'45%',background:'#111',padding:20}}>The 3D surface could not start. Use Back to return to the landing map.</p>}
  </div>
}
