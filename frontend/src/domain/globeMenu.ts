import type { Layers } from './siteLayers'

/**
 * The buttons of the menu on the left of the globe, in order, under the two level buttons (`globeLevels.ts`).
 * The words are English on purpose, in both languages.
 */
export const MENU_ITEMS = [
  { id: 'initial', label: 'Initial position' },
  { id: 'dark_side', label: 'Dark side' },
  { id: 'north', label: 'Northern Hemisphere' },
  { id: 'south', label: 'Southern Hemisphere' },
  { id: 'missions', label: 'Lunar Missions' },
  { id: 'sites', label: 'Sites' },
] as const

export type MenuId = (typeof MENU_ITEMS)[number]['id']
export type MenuState = Record<MenuId, boolean>

/** The two switches of the layers, the only buttons of the orbit that also make sense on the polar map. */
export const LAYER_BUTTONS = ['missions', 'sites'] as const

/**
 * The buttons under the levels for a view: all six in orbit; on the polar map only the two switches, since
 * the map does not turn the Moon. The switches are the same in both, so their state carries over.
 */
export const menuItemsFor = (mode: 'orbit' | 'map') =>
  mode === 'orbit' ? MENU_ITEMS : MENU_ITEMS.filter((item) => (LAYER_BUTTONS as readonly string[]).includes(item.id))

/** Only "Sites" starts pressed. */
export const initialMenu = (): MenuState => ({ initial: false, dark_side: false, north: false, south: false, missions: false, sites: true })

/** The four buttons that turn the Moon: pressing one releases the other three, as the Moon can only face one way. */
export const VIEW_BUTTONS = ['initial', 'dark_side', 'north', 'south'] as const

/**
 * A click presses a released button and releases a pressed one. Pressing one of the four that turn the
 * Moon releases the other three; Missions and Sites are their own switches and never touch another.
 */
export function toggled(state: MenuState, id: MenuId): MenuState {
  const next = { ...state, [id]: !state[id] }
  if (next[id] && (VIEW_BUTTONS as readonly string[]).includes(id)) for (const other of VIEW_BUTTONS) if (other !== id) next[other] = false
  return next
}

/** The same four buttons with all of them released: the Moon was turned some other way (to the map and back, say). */
export function releasedTurns(state: MenuState): MenuState {
  const next = { ...state }
  for (const id of VIEW_BUTTONS) next[id] = false
  return next
}

/**
 * What the two switches say about the dots of the globe. The four buttons that turn the Moon act through
 * the camera (`GlobeMenu`'s `onView`) and have nothing to add here.
 */
export const layersOf = (state: MenuState): Layers => ({ sites: state.sites, missions: state.missions })
