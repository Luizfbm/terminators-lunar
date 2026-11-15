import type { View } from './query'

/**
 * The two levels at the top of the globe's menu: the context the stage is in. They are not a second way of
 * moving the camera: each is one of the app's views ("From orbit", "Map") seen from the menu, and the view
 * buttons under the stage keep working. The view from the ground is no level, so with it neither is pressed.
 * The words are English on purpose, in both languages.
 */
export const LEVEL_ITEMS = [
  { id: 'explore', label: 'Explore the Moon', view: 'orbit' },
  { id: 'south_pole', label: 'South Pole in detail', view: 'map' },
] as const

export type LevelId = (typeof LEVEL_ITEMS)[number]['id']

/** The level that is pressed for a view, if there is one. */
export const levelOfView = (view: View): LevelId | null => LEVEL_ITEMS.find((item) => item.view === view)?.id ?? null

/** The view a level stands for. */
export const viewOfLevel = (id: LevelId): View => LEVEL_ITEMS.find((item) => item.id === id)!.view

/**
 * The view to ask for when a level is clicked, or null when there is nothing to do: the two are exclusive,
 * like radio buttons, so clicking the one that is pressed does not release it.
 */
export const levelPressed = (current: LevelId | null, id: LevelId): View | null => (current === id ? null : viewOfLevel(id))
