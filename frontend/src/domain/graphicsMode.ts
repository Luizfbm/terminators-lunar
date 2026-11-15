/** Rendering budget only: this never changes terrain samples or ephemerides. */
export function lowGraphics(search: string): boolean {
  return new URLSearchParams(search).get('graphics') === 'low'
}
// Imported by main before React can canonicalise the Query URL, and reused by lazy scenes.
export const LIGHT_GRAPHICS = typeof window !== 'undefined' && lowGraphics(window.location.search)

export function lightGraphicsSearch(search: string): string {
  const params = new URLSearchParams(search)
  params.set('graphics', 'low')
  return `?${params}`
}
