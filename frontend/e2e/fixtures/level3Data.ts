import type { LandingArea } from '../../src/components/exploration/area'
/** Synthetic terrain for UI tests only, never an app fallback. */
export function level3Data(lat=-89.5,lon=0): LandingArea {
  const radius=1737400,rho=2*radius*Math.tan((45+lat/2)*Math.PI/180)
  const x=rho*Math.sin(lon*Math.PI/180),y=rho*Math.cos(lon*Math.PI/180)
  const site={id:'custom:test',name:'Synthetic UI test',latitude_deg:lat,longitude_deg:lon,source:'custom',curated:false}
  const grid=(cell:number,size:number)=>({site,dem:{product:`SYNTHETIC-TEST-${cell}`,resolution_m:cell},projection:'south_polar_stereographic' as const,
    center_longitude_deg:0,sphere_radius_m:radius,size_px:size,metres_per_pixel:cell,x_min_m:x-size*cell/2,y_max_m:y+size*cell/2,half_extent_m:5000,
    heights:{at_0_m:-500,at_65535_m:500,quantum_m:1000/65535,values:Array.from({length:size*size},(_,i)=>{
      const c=(i%size-(size-1)/2)*cell,r=(Math.floor(i/size)-(size-1)/2)*cell
      return Math.round((500+80*Math.sin(c/1300)*Math.cos(r/1100))/1000*65535)
    })}})
  return {site,selection_max_latitude_deg:-87.5,width_m:10000,bounds:{x_min_m:x-5000,x_max_m:x+5000,y_min_m:y-5000,y_max_m:y+5000},before:grid(80,129),after:grid(20,505)} as LandingArea
}
