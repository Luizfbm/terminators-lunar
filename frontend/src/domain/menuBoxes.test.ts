import { describe, expect, it } from 'vitest'
import { needsMenuBoxes, type MenuUse } from './menuBoxes'

const rest: MenuUse = { mode: 'orbit', dive: false, shownDive: false, pinFacing: false, pinWidth: 120, roomOnRight: 400 }

describe('when the stage measures the menu', () => {
  it('measures in orbit at rest and during a flight of the view, for the letters of the poles and the planets', () => {
    expect(needsMenuBoxes(rest)).toBe(true)
    expect(needsMenuBoxes({ ...rest, pinFacing: true })).toBe(true)
  })

  it('does not measure during the dive, while the name has room on the right', () => {
    expect(needsMenuBoxes({ ...rest, dive: true })).toBe(false)
    expect(needsMenuBoxes({ ...rest, dive: true, pinFacing: true })).toBe(false)
  })

  it('does not measure once the camera is sent to the Site, on the way down or when it is there', () => {
    expect(needsMenuBoxes({ ...rest, shownDive: true })).toBe(false)
    expect(needsMenuBoxes({ ...rest, shownDive: true, dive: true, pinFacing: true })).toBe(false)
  })

  it('does not measure on the map while the name has room: the letters and the planets are not drawn there', () => {
    expect(needsMenuBoxes({ ...rest, mode: 'map' })).toBe(false)
    expect(needsMenuBoxes({ ...rest, mode: 'map', pinFacing: true })).toBe(false)
  })

  it("measures for the Site's name when it does not fit on the right of its dot, in any view", () => {
    const tight = { pinFacing: true, pinWidth: 180, roomOnRight: 100 }
    expect(needsMenuBoxes({ ...rest, ...tight, dive: true })).toBe(true)
    expect(needsMenuBoxes({ ...rest, ...tight, shownDive: true })).toBe(true)
    expect(needsMenuBoxes({ ...rest, ...tight, mode: 'map' })).toBe(true)
  })

  it('does not measure for a name that is not on the stage, whatever room it would have had', () => {
    expect(needsMenuBoxes({ ...rest, mode: 'map', pinFacing: false, pinWidth: 180, roomOnRight: 100 })).toBe(false)
  })
})
