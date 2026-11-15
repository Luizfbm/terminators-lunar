import { useEffect, useRef, type RefObject } from 'react'
import { missionLabel } from '../../domain/markers'
import { layerOf } from '../../domain/siteLayers'
import { useI18n } from '../../i18n/I18nContext'
import { fill, STRINGS } from './strings'
import type { MapEvent, MapRegion, MapSite } from './map'

/** Every element the drawing loop moves, by key: `region:<id>` and `site:<id>`. */
export type MarkerElements = Map<string, HTMLElement>

/**
 * The buttons on the polar map: one per Region seen from the pole, and the Sites of the Region
 * flown into. They are real buttons, so a mouse, a finger and the keyboard all reach them; the
 * drawing loop only moves them to where their places are on screen.
 */
export function MapLayer({
  regions,
  loose,
  region,
  chosenId,
  elements,
  layer,
  onEvent,
}: {
  regions: readonly MapRegion[]
  loose: readonly MapSite[]
  region: string | null
  chosenId: string
  elements: MarkerElements
  layer: RefObject<HTMLDivElement | null>
  onEvent: (event: MapEvent) => void
}) {
  const { locale } = useI18n()
  const s = STRINGS[locale]
  const open = regions.find((entry) => entry.id === region) ?? null
  const sites = [...(open?.sites ?? []), ...loose]
  const keep = (key: string) => (element: HTMLElement | null) => {
    if (element) elements.set(key, element)
    else elements.delete(key)
  }

  // Esc flies back out, unless something else on the page has already used it.
  useEffect(() => {
    if (region === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, [role="dialog"], [role="listbox"]') || target.isContentEditable)) return
      onEvent({ type: 'key', key: event.key })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [region, onEvent])

  // The focus follows the flight: in to the first Site of the Region, back out to its marker.
  const before = useRef<string | null>(region)
  useEffect(() => {
    const was = before.current
    before.current = region
    if (was === region) return
    const active = document.activeElement
    const ours = !active || active === document.body || layer.current?.contains(active)
    if (!ours) return
    const key = region !== null ? `site:${open?.sites[0]?.id ?? ''}` : `region:${was ?? ''}`
    // The drawing loop shows the buttons on its next frame; they cannot take the focus before.
    requestAnimationFrame(() => requestAnimationFrame(() => elements.get(key)?.focus({ preventScroll: true })))
  }, [region, open, elements, layer])

  return (
    <div className="globe__map" ref={layer} hidden>
      <div role="group" aria-label={s.regions}>
        {regions
          .filter((entry) => entry.id !== region)
          .map((entry) => (
            <button
              key={`region:${entry.id}`}
              ref={keep(`region:${entry.id}`)}
              type="button"
              className="globe__region"
              data-chosen={entry.sites.some((site) => site.id === chosenId)}
              aria-label={entry.sites.length === 1 ? fill(s.regionOne, { name: entry.name }) : fill(s.region, { name: entry.name, count: String(entry.sites.length) })}
              onClick={() => onEvent({ type: 'region', id: entry.id })}
              hidden
            >
              <span className="globe__count" aria-hidden="true">
                {entry.sites.length}
              </span>
              <span className="globe__name" aria-hidden="true">
                {entry.name}
              </span>
            </button>
          ))}
        {sites.map((site) => (
          <button
            key={`site:${site.id}`}
            ref={keep(`site:${site.id}`)}
            type="button"
            className="globe__site"
            aria-label={site.name}
            title={site.name}
            aria-current={site.id === chosenId ? 'true' : undefined}
            data-mission={layerOf(site.source) === 'missions' || undefined}
            onClick={() => onEvent({ type: 'site', id: site.id })}
            hidden
          >
            <span className="globe__name" aria-hidden="true">
              {layerOf(site.source) === 'missions' ? missionLabel(site.name) : site.name}
            </span>
          </button>
        ))}
      </div>
      {region !== null && (
        <button type="button" className="globe__back" aria-keyshortcuts="Escape" onClick={() => onEvent({ type: 'back' })}>
          {s.allRegions}
        </button>
      )}
    </div>
  )
}
