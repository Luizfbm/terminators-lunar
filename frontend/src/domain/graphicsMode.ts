/** Rendering budget only: this never changes terrain samples or ephemerides. */
export function lowGraphics(search: string): boolean {
  return new URLSearchParams(search).get('graphics') === 'low'
}
/** `?graphics=high` asks for the Moon's 8192 px images. Nobody gets them without asking. */
export function highGraphics(search: string): boolean {
  return new URLSearchParams(search).get('graphics') === 'high'
}
// Imported by main before React can canonicalise the Query URL, and reused by lazy scenes.
export const LIGHT_GRAPHICS = typeof window !== 'undefined' && lowGraphics(window.location.search)
export const SHARP_GRAPHICS = typeof window !== 'undefined' && highGraphics(window.location.search)

export function lightGraphicsSearch(search: string): string {
  const params = new URLSearchParams(search)
  params.set('graphics', 'low')
  return `?${params}`
}
