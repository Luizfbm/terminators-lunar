import { describe, expect, it } from 'vitest'
import { landerOf } from '../phase4/battery/api'
import { VEHICLES, type Vehicle } from '../vehiclePicker/vehicles'
import { estimatedBatteryFigures, vehicleDraft } from './vehicleLander'

const byId = (id: string) => VEHICLES.find((vehicle) => vehicle.id === id) as Vehicle

describe('the rover as the lander of the Battery row', () => {
  it('sends the rover figures as they are: panel = solarW, load = powerShadowW, capacity = batteryWh', () => {
    expect(landerOf(vehicleDraft(byId('viper')))).toEqual({ panel_power_w: 450, load_w: 95, battery_wh: 5420 })
  })

  it('keeps a rover with no panels (the LRV): the contract allows 0 W', () => {
    expect(landerOf(vehicleDraft(byId('lrv')))).toEqual({ panel_power_w: 0, load_w: 350, battery_wh: 8712 })
  })

  it('asks nothing with no rover', () => {
    expect(landerOf(vehicleDraft(null))).toBeNull()
    expect(landerOf(vehicleDraft(undefined))).toBeNull()
  })

  it('names the estimated battery figures, and only those', () => {
    expect(estimatedBatteryFigures(byId('viper'))).toEqual([])
    expect(estimatedBatteryFigures(byId('lrv'))).toEqual(['powerShadowW'])
    expect(estimatedBatteryFigures(byId('ltv'))).toEqual(['batteryWh', 'solarW', 'powerShadowW'])
  })
})
