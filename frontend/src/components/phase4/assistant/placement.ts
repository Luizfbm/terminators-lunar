/**
 * Where the Ask button lives (the requirement). Under this width it goes into the time strip, so it
 * never floats over the answer; the strip's layout in assistant.css makes room at the same width.
 */
export const STRIP_QUERY = '(max-width: 760px)'

/** The strip's slot when the screen is narrow and the strip is on it; null keeps the button in the top bar. */
export function askHome(narrow: boolean, slot: Element | null): Element | null {
  return narrow ? slot : null
}
