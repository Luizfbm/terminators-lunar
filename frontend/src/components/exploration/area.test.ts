import { describe, expect, it } from 'vitest'
import { level3Data } from '../../../e2e/fixtures/level3Data'
import { areaPoint, drive, insideLevel3, surfaceGeometry } from './area'

describe('level 3 selection and rover geometry',()=>{
  it('accepts only finite south-core coordinates, including both longitude edges',()=>{
    expect(insideLevel3(-90,-180)).toBe(true);expect(insideLevel3(-87.5,180)).toBe(true)
    for(const p of [[-87.49,0],[-91,0],[-89,181],[NaN,0],[0,Infinity]]) expect(insideLevel3(p[0],p[1])).toBe(false)
  })
  it('uses one shared projected rectangle for both products',()=>{
    const area=level3Data()
    expect(areaPoint(area,0,0)).toEqual({x:area.bounds.x_min_m,y:area.bounds.y_max_m})
    expect(areaPoint(area,1,1)).toEqual({x:area.bounds.x_max_m,y:area.bounds.y_min_m})
    expect(areaPoint(area,.5,.5)).toEqual({x:0,y:(area.bounds.y_min_m+area.bounds.y_max_m)/2})
  })
  it('turns clockwise from true north at different meridians and clamps to the same area',()=>{
    const a=level3Data(-89.5,90),c=areaPoint(a,.5,.5)
    expect(drive({...c,heading:0},0,10,a).x).toBeCloseTo(c.x+10)
    expect(drive({...c,heading:0},90,10,a).y).toBeCloseTo(c.y-10)
    const end=drive({...c,heading:0},0,100000,a)
    expect(end.x).toBe(a.bounds.x_max_m-4)
    expect(drive({...c,heading:350},30,0,a).heading).toBe(20)
  })
  it('puts the rover on the exact rendered native triangle rather than a separate flat plane',()=>{
    const a=level3Data(),g=surfaceGeometry(a),map=g.map
    const c=251,r=249,u=.25,v=.35,x=map.xMinM+(c+.5+u)*20,y=map.yMaxM-(r+.5+v)*20
    const nodes=[r*map.size+c,r*map.size+c+1,(r+1)*map.size+c],weights=[1-u-v,u,v]
    const expected=[0,1,2].map(axis=>nodes.reduce((sum,n,i)=>sum+g.positions[n*3+axis]*weights[i],0))
    g.at(x,y).forEach((value,i)=>expect(value).toBeCloseTo(expected[i],5))
  })
})
