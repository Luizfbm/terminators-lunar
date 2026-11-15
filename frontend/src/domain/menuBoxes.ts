/**
 * Whether the stage has to measure what the globe's menu takes of it this frame. Measuring reads the
 * layout of the page (a rectangle per menu element, and the stage's own), and the draw loop would do it
 * at every frame, so it is done only for what uses it: the letters of the poles and the names of the
 * planets, which are drawn only for the whole Moon from orbit and not during the dive, and the Site's
 * name, which only steps clear of the menu when it does not fit on the right of its dot.
 */
export interface MenuUse {
  mode: 'orbit' | 'map'
  /** The camera is on its way down to the Site or back up. */
  dive: boolean
  /** The camera is at the Site, or has been sent there. */
  shownDive: boolean
  /** The Site's name is on the stage (its dot faces the camera). */
  pinFacing: boolean
  /** The width of the Site's name, in pixels. */
  pinWidth: number
  /** The room on the right of the Site's dot, in pixels. */
  roomOnRight: number
}

export function needsMenuBoxes(use: MenuUse): boolean {
  const poleLettersAndPlanetNames = use.mode === 'orbit' && !use.dive && !use.shownDive
  const pinStepsAside = use.pinFacing && use.pinWidth > use.roomOnRight
  return poleLettersAndPlanetNames || pinStepsAside
}
