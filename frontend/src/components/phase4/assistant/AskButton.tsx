import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../../i18n/I18nContext'
import { askHome, STRIP_QUERY } from './placement'
import { STRINGS } from './strings'
import './assistant.css'

/**
 * The strip's slot for the button while the screen is narrow and the time strip is on it, else
 * null. The strip is a direct child of `.screen` and comes and goes with the answer, so the screen's
 * children are watched; the width is watched through the same media query the CSS uses.
 */
function useStripSlot(anchor: React.RefObject<HTMLElement | null>): Element | null {
  const [slot, setSlot] = useState<Element | null>(null)
  useEffect(() => {
    const screen = anchor.current?.closest('.screen')
    if (!screen) return
    const narrow = window.matchMedia(STRIP_QUERY)
    const place = () => setSlot(askHome(narrow.matches, screen.querySelector(':scope > footer.strip > .strip__ask')))
    const children = new MutationObserver(place)
    children.observe(screen, { childList: true })
    narrow.addEventListener('change', place)
    place()
    return () => {
      children.disconnect()
      narrow.removeEventListener('change', place)
    }
  }, [anchor])
  return slot
}

/**
 * The way into the assistant, on every screen (the requirement). It sits in the top bar with Guide and
 * About; on a phone it goes into the time strip, which stays pinned at the foot of the screen, so it
 * never scrolls away with the answer and never lies over it (the requirement). One element in one place
 * in the tab order at every width.
 */
export function AskButton({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const { locale } = useI18n()
  const s = STRINGS[locale]
  // An empty marker where the button sits in the top bar: it stays put when the button moves, so
  // the screen can be found again from it.
  const anchor = useRef<HTMLSpanElement>(null)
  const slot = useStripSlot(anchor)
  const button = (
    <button
      type="button"
      className="ask-button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={s.buttonLabel}
      onClick={onOpen}
    >
      <span className="ask-button__icon" aria-hidden="true">
        ?
      </span>
      {s.button}
    </button>
  )
  return (
    <>
      <span ref={anchor} hidden />
      {slot ? createPortal(button, slot) : button}
    </>
  )
}
