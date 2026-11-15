import '@fontsource/orbitron/latin-500.css'
import '@fontsource/orbitron/latin-600.css'
import { useState } from 'react'
import { initialMenu, menuItemsFor, releasedTurns, toggled, type MenuId, type MenuState } from '../domain/globeMenu'
import { LEVEL_ITEMS, levelPressed, type LevelId } from '../domain/globeLevels'
import type { View } from '../domain/query'
import { toggledLayer, type Layers } from '../domain/siteLayers'
import type { MoonView } from '../domain/viewTarget'

/** The buttons that turn the Moon, and where each turns it. */
const TURNS: Partial<Record<MenuId, MoonView>> = { initial: 'initial', dark_side: 'dark', north: 'north', south: 'south' }

export interface GlobeMenuProps {
  /** How the globe is shown: the buttons that turn the Moon only make sense in orbit; the two switches in both. */
  mode: 'orbit' | 'map'
  /** The level that is pressed, which is the view the app is in, or none on the ground. */
  level: LevelId | null
  /** A level was clicked: the view to ask the app for. */
  onLevel?: (view: View) => void
  onView: (view: MoonView) => void
  /** The two switches, kept by the app so they are the same in orbit, on the map and back from the ground. */
  layers: Layers
  /** A switch was pressed or released: the layers as they are now. */
  onLayers: (layers: Layers) => void
}

/**
 * The menu on the left of the globe. At the top the two levels, exclusive like radio buttons and kept in
 * step with the app's view, then a rule, then the buttons of the view: in orbit four that turn the Moon
 * (exclusive among themselves) and the two switches for the dots; on the polar map the two switches only.
 * Pressed stays pressed until it is clicked again. The switches belong to the app (`layers`); which way
 * the Moon was turned is the menu's own, and is not kept between visits.
 */
export function GlobeMenu({ mode, level, onLevel, onView, layers, onLayers }: GlobeMenuProps) {
  const [turns, setTurns] = useState<MenuState>(initialMenu)
  // The camera goes its own way when the view changes, so no turn of the Moon is left pressed.
  const [shownMode, setShownMode] = useState(mode)
  if (shownMode !== mode) {
    setShownMode(mode)
    setTurns(releasedTurns(turns))
  }
  const pressed: MenuState = { ...turns, missions: layers.missions, sites: layers.sites }
  const press = (id: MenuId) => {
    if (id === 'missions' || id === 'sites') {
      onLayers(toggledLayer(layers, id))
      return
    }
    const next = toggled(turns, id)
    setTurns(next)
    // Pressing turns the Moon; releasing leaves it where it is.
    const view = TURNS[id]
    if (view && next[id]) onView(view)
  }
  return (
    <div className="globe-menu" role="group" aria-label="Globe menu">
      <div role="group" aria-label="Level">
        {LEVEL_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="globe-menu__button"
            aria-pressed={level === item.id}
            onClick={() => {
              const view = levelPressed(level, item.id)
              if (view) onLevel?.(view)
            }}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <hr className="globe-menu__rule" />
      {menuItemsFor(mode).map((item) => (
        <button key={item.id} type="button" className="globe-menu__button" aria-pressed={pressed[item.id]} onClick={() => press(item.id)}>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
