import '@fontsource/orbitron/latin-500.css'
import '@fontsource/orbitron/latin-600.css'
import { useState, type ReactNode } from 'react'
import { initialMenu, layersOf, MENU_ITEMS, releasedTurns, toggled, type MenuId, type MenuState } from '../domain/globeMenu'
import { LEVEL_ITEMS, levelPressed, type LevelId } from '../domain/globeLevels'
import type { View } from '../domain/query'
import type { Layers } from '../domain/siteLayers'
import type { MoonView } from '../domain/viewTarget'

/** The buttons that turn the Moon, and where each turns it. */
const TURNS: Partial<Record<MenuId, MoonView>> = { initial: 'initial', dark_side: 'dark', north: 'north', south: 'south' }

export interface GlobeMenuProps {
  /** How the globe is shown: the buttons that turn the Moon and switch its dots only make sense in orbit. */
  mode: 'orbit' | 'map'
  /** The level that is pressed, which is the view the app is in, or none on the ground. */
  level: LevelId | null
  /** A level was clicked: the view to ask the app for. */
  onLevel?: (view: View) => void
  onView: (view: MoonView) => void
  /** The switches that show and hide the dots, told on every change. */
  onLayers: (layers: Layers) => void
  /** Items the app adds at the foot of the menu (its Guide, About, Proof and languages); told how to fold the panel. */
  nav?: (close: () => void) => ReactNode
}

/**
 * The menu on the left of the globe. At the top the two levels, exclusive like radio buttons and kept in
 * step with the app's view, then a rule, then the buttons of the orbit: four that turn the Moon (exclusive
 * among themselves) and three switches (the dots of the Artemis Sites, the dots of the missions, the planets of
 * the sky). Pressed stays pressed until it is clicked again. On the map only the levels are shown. The state is
 * not kept between visits. On a phone the panel does not fit beside the Moon: it folds into a button in the
 * corner that opens it (the stylesheet decides where; on a wide screen the button is not there).
 */
export function GlobeMenu({ mode, level, onLevel, onView, onLayers, nav }: GlobeMenuProps) {
  const [pressed, setPressed] = useState<MenuState>(initialMenu)
  const [open, setOpen] = useState(false)
  // The camera goes its own way when the view changes, so no turn of the Moon is left pressed.
  const [shownMode, setShownMode] = useState(mode)
  if (shownMode !== mode) {
    setShownMode(mode)
    setPressed(releasedTurns(pressed))
  }
  const press = (id: MenuId) => {
    const next = toggled(pressed, id)
    setPressed(next)
    // Pressing turns the Moon; releasing leaves it where it is.
    const view = TURNS[id]
    if (view) {
      if (next[id]) {
        onView(view)
        setOpen(false)
      }
    } else onLayers(layersOf(next))
  }
  return (
    <>
      <button type="button" className="globe-menu__toggle" aria-label="Menu" aria-expanded={open} aria-controls="globe-menu-panel" onClick={() => setOpen(!open)}>
        <span aria-hidden="true" />
      </button>
      <div className="globe-menu" id="globe-menu-panel" data-open={open} role="group" aria-label="Globe menu">
        <div role="group" aria-label="Level">
          {LEVEL_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="globe-menu__button"
              aria-pressed={level === item.id}
              onClick={() => {
                const view = levelPressed(level, item.id)
                if (view) {
                  onLevel?.(view)
                  setOpen(false)
                }
              }}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        {mode === 'orbit' && (
          <>
            <hr className="globe-menu__rule" />
            {MENU_ITEMS.map((item) => (
              <button key={item.id} type="button" className="globe-menu__button" aria-pressed={pressed[item.id]} onClick={() => press(item.id)}>
                <span>{item.label}</span>
              </button>
            ))}
          </>
        )}
        {nav?.(() => setOpen(false))}
      </div>
    </>
  )
}
