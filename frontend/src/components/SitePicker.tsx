import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Region, Site } from '../api/client'
import { isCustomSite, type Coordinate } from '../domain/query'
import { activeIndex, flatten, groupSites, type SiteGroup } from '../domain/sites'
import { useRegions } from '../hooks/useRegions'
import { useI18n } from '../i18n/I18nContext'
import type { I18n } from '../i18n/i18n'
import { CustomSiteForm } from './CustomSiteForm'
import { scrollTopToShow } from './siteList'
import { coordinate } from './siteName'
import './SitePicker.css'

/** Below this width the list is a full-screen sheet; the same width the layout uses for a phone. */
const SHEET_QUERY = '(max-width: 760px)'

/**
 * Choosing the Site: the name is the trigger; it opens a dialog with a searchable list grouped by
 * Region (WAI-ARIA combobox with a listbox). On a phone the dialog is a full-screen sheet; on a larger
 * screen it opens under the name, over a dimmed page, and a click outside closes it. Either way it has
 * a Close button, opens on the chosen Site, keeps the Tab key inside, and gives the focus back to the
 * name when it closes (the requirement). The chosen Site
 * always shows, even before the list arrives. At the foot, a coordinate can be typed instead: a
 * custom Site.
 */
export function SitePicker({
  sites,
  site,
  maxLatitudeDeg,
  onSite,
  onCoordinate,
}: {
  sites: readonly Site[]
  site: Site
  /** The northernmost latitude a custom Site may have (`coverage.custom_max_latitude_deg`). */
  maxLatitudeDeg: number
  onSite: (siteId: string) => void
  onCoordinate: (coordinate: Coordinate) => void
}) {
  const { t } = useI18n()
  // Asked once with the page, not each time the list opens: a list that opened before the Regions
  // arrived was reordered under the reader's eyes (the requirement).
  const regions = useRegions()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Where the focus goes once the list closes: always back to the name, or only when the focus was
  // lost (a click outside on something that takes no focus), or nowhere.
  const refocus = useRef<'always' | 'ifLost' | null>(null)
  const dialogId = useId()

  // The focus goes back to the name once the dialog is gone, on the next frame: a mousedown outside
  // moves the focus to the page after the pointerdown that closed the list.
  useEffect(() => {
    const mode = refocus.current
    if (open || !mode) return
    refocus.current = null
    const frame = requestAnimationFrame(() => {
      const lost = !document.activeElement || document.activeElement === document.body
      if (mode === 'always' || lost) triggerRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const close = (mode: 'always' | 'ifLost' = 'always') => {
    refocus.current = mode
    setOpen(false)
  }

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
    }
  }

  return (
    <span className="site-pick">
      <button
        ref={triggerRef}
        type="button"
        className="site"
        aria-label={`${t('site.label')}: ${site.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={onTriggerKey}
      >
        {site.name}
      </button>
      {open && (
        <SiteList
          dialogId={dialogId}
          sites={sites}
          regions={regions}
          site={site}
          anchor={triggerRef}
          onPick={(id) => {
            close()
            if (id !== site.id) onSite(id)
          }}
          maxLatitudeDeg={maxLatitudeDeg}
          onCoordinate={(coordinate) => {
            close()
            const same =
              isCustomSite(site) &&
              coordinate.latitudeDeg === site.latitude_deg &&
              coordinate.longitudeDeg === site.longitude_deg
            if (!same) onCoordinate(coordinate)
          }}
          onClose={close}
        />
      )}
    </span>
  )
}

function SiteList({
  dialogId,
  sites,
  regions,
  site,
  anchor,
  onPick,
  maxLatitudeDeg,
  onCoordinate,
  onClose,
}: {
  dialogId: string
  sites: readonly Site[]
  regions: readonly Region[]
  site: Site
  anchor: RefObject<HTMLButtonElement | null>
  onPick: (siteId: string) => void
  maxLatitudeDeg: number
  onCoordinate: (coordinate: Coordinate) => void
  onClose: (refocus?: 'always' | 'ifLost') => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const [search, setSearch] = useState('')
  const groups = useMemo(() => groupSites(sites, regions, site, search), [sites, regions, site, search])
  const flat = useMemo(() => flatten(groups), [groups])
  // The highlight follows a Site, not a position: the list can reorder while it is open.
  const [activeId, setActiveId] = useState<string | null>(site.id)
  const activeSite = flat[activeIndex(flat, activeId)]
  // Until the reader moves the highlight or searches, the list keeps the chosen Site in its middle.
  const follow = useRef(true)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const place = usePlacement(anchor)
  const listId = `${dialogId}-list`
  const titleId = `${dialogId}-title`
  const optionId = (id: string) => `${dialogId}-${id}`

  // The focus moves in once the list is placed (a hidden input cannot take it). On a large screen it
  // goes to the search; on a phone to the Close button, so the keyboard does not cover the list.
  useLayoutEffect(() => {
    if (!place.placed) return
    if (place.sheet) closeRef.current?.focus()
    else inputRef.current?.focus()
  }, [place.placed, place.sheet])

  // A click outside closes the list and gives the focus back to the name. The dimmed page under the
  // list lets the click through, so a click outside works as it did before the list was a dialog;
  // a modal backdrop caught every such click.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (dialogRef.current?.contains(target) || anchor.current?.contains(target)) return
      onClose('ifLost')
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [anchor, onClose])

  // Bring the highlighted Site into view: centred while following the chosen one, else the least move.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const option = activeSite ? document.getElementById(optionId(activeSite.id)) : null
    if (!place.placed || !scroller || !option) return
    const top = option.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTop = scrollTopToShow(
      { top: scroller.scrollTop, height: scroller.clientHeight },
      { top, height: option.offsetHeight },
      follow.current,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.placed, place.sheet, activeSite?.id, flat])

  const move = (index: number) => {
    follow.current = false
    setActiveId(flat[index]?.id ?? null)
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const index = activeIndex(flat, activeId)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(Math.min(index + 1, flat.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(Math.max(index - 1, 0))
    } else if (event.key === 'Home' && event.ctrlKey) {
      move(0)
    } else if (event.key === 'End' && event.ctrlKey) {
      move(flat.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeSite) onPick(activeSite.id)
    }
  }

  // Escape closes from anywhere in the dialog. Tab walks from the search on to the coordinate fields
  // and wraps around at either end, so the focus stays in the dialog while it is open.
  const onDialogKey = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const stops = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')].filter(
      (element) => !element.matches(':disabled'),
    )
    const first = stops[0]
    const last = stops.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const source = isCustomSite(site) ? t('sites.custom.source') : t('sites.source', { reference: site.source_reference })

  // In <body>, above the bar, the strip and everything else on the page, whatever stacks them.
  return createPortal(
    <div className="site-sheet">
      {!place.sheet && <div className="site-sheet__backdrop" aria-hidden="true" style={{ visibility: place.style.visibility }} />}
      <dialog
        open
        ref={dialogRef}
        id={dialogId}
        className={`site-list${place.sheet ? ' site-list--sheet' : ''}`}
        aria-modal="true"
        aria-labelledby={titleId}
        style={place.style}
        onKeyDown={onDialogKey}
      >
        <div className="site-list__head">
          <h2 id={titleId} className="site-list__title">
            {t('sites.dialog')}
          </h2>
          <button ref={closeRef} type="button" className="site-list__close" onClick={() => onClose()}>
            {t('sites.close')}
          </button>
        </div>
        <input
          ref={inputRef}
          className="site-list__search"
          type="search"
          role="combobox"
          aria-label={t('sites.search')}
          placeholder={t('sites.search')}
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeSite ? optionId(activeSite.id) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={search}
          onChange={(event) => {
            follow.current = false
            setSearch(event.target.value)
            setActiveId(null)
          }}
          onKeyDown={onKey}
        />
        {/* The search drives the list, but the scroller is a Tab stop of its own: the options are not
            focusable (aria-activedescendant), so without it a keyboard user could not scroll the list,
            and axe flags it (scrollable-region-focusable). */}
        <div ref={scrollerRef} className="site-list__scroll" tabIndex={0} aria-label={t('sites.list')}>
          <div id={listId} role="listbox" aria-label={t('sites.list')} className="site-list__options">
            {groups.map((group) => (
              <div key={group.key} role="group" aria-labelledby={`${dialogId}-${group.key}`}>
                <p id={`${dialogId}-${group.key}`} className="site-list__group" role="presentation">
                  {groupTitle(group, t)}
                </p>
                {group.sites.map((entry) => (
                  <div
                    key={entry.id}
                    id={optionId(entry.id)}
                    role="option"
                    aria-selected={entry.id === site.id}
                    className={`site-list__option${entry.id === activeSite?.id ? ' site-list__option--active' : ''}`}
                    onPointerMove={() => {
                      if (entry.id === activeSite?.id) return
                      follow.current = false
                      setActiveId(entry.id)
                    }}
                    onClick={() => onPick(entry.id)}
                  >
                    <span className="site-list__name">{entry.name}</span>
                    <span className="site-list__where">{coordinate(entry, i18n)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {flat.length === 0 && sites.length > 0 && <p className="site-list__note" role="status">{t('sites.empty')}</p>}
          {sites.length === 0 && <p className="site-list__note" role="status">{t('sites.loading')}</p>}
          {/* The citation sits at the foot of the list, where it no longer covers the first row. */}
          <p className="site-list__source">{source}</p>
        </div>
        <CustomSiteForm site={site} maxLatitudeDeg={maxLatitudeDeg} onCoordinate={onCoordinate} />
      </dialog>
    </div>,
    document.body,
  )
}

function groupTitle(group: SiteGroup, t: I18n['t']): string {
  if (group.kind === 'offPole') return t('sites.offPole')
  if (group.kind === 'polar') return t('sites.polar')
  const name = group.region?.name ?? group.regionId
  return group.region?.artemis_iii_current ? t('sites.regionArtemis', { name }) : name
}

interface Placement {
  placed: boolean
  /** A full-screen sheet (a phone), placed by the stylesheet alone. */
  sheet: boolean
  style: CSSProperties
}

/**
 * Where the list goes. On a phone it is a full-screen sheet. On a larger screen it opens under the
 * name when there is room, otherwise from the top of the screen, and stops above the time strip.
 */
function usePlacement(anchor: RefObject<HTMLButtonElement | null>): Placement {
  const [place, setPlace] = useState<Placement>({ placed: false, sheet: false, style: { visibility: 'hidden' } })
  useLayoutEffect(() => {
    const measure = () => {
      if (window.matchMedia(SHEET_QUERY).matches) {
        setPlace({ placed: true, sheet: true, style: {} })
        return
      }
      const trigger = anchor.current?.getBoundingClientRect()
      if (!trigger) return
      const gutter = 16
      const strip = document.querySelector('.strip')?.getBoundingClientRect()
      const floor = Math.min(window.innerHeight, strip && strip.top > 0 ? strip.top : window.innerHeight) - gutter
      const width = Math.min(448, window.innerWidth - 2 * gutter)
      const left = Math.min(Math.max(gutter, trigger.left), window.innerWidth - gutter - width)
      const below = trigger.bottom + 6
      const top = floor - below >= 280 ? below : gutter
      setPlace({ placed: true, sheet: false, style: { top, left, width, maxHeight: Math.max(160, floor - top) } })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [anchor])
  return place
}
