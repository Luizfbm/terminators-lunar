import type { components } from '../api/schema'

type Meta = components['schemas']['Meta']
type Site = components['schemas']['Site']

/** A custom Site: a coordinate the visitor typed or opened from a link. */
export interface Coordinate {
  latitudeDeg: number
  longitudeDeg: number
}

/** Which Site the Query asks about: a Curated Site by its code, or a custom Site by its coordinate. */
export type SiteRef = string | Coordinate

export function isCoordinate(ref: SiteRef | null): ref is Coordinate {
  return ref !== null && typeof ref !== 'string'
}

/** Text that changes whenever the Site asked about changes, for request keys. */
export function siteKey(ref: SiteRef | null): string {
  if (ref === null) return ''
  return isCoordinate(ref) ? `${ref.latitudeDeg},${ref.longitudeDeg}` : ref
}

export function isCustomSite(site: Site): boolean {
  return site.source === 'custom'
}

/** How to ask again for the Site an answer is about: a custom Site has no code, only its coordinate. */
export function siteRefOf(site: Site): SiteRef {
  return isCustomSite(site) ? { latitudeDeg: site.latitude_deg, longitudeDeg: site.longitude_deg } : site.id
}

export interface Query {
  site: SiteRef
  start: Date
  durationHours: number
  observerHeightM: number
}

const DAY_MS = 86_400_000

/**
 * The Window and the Observer height the visitor picked. null means the default: a Window from
 * 00:00 UTC of today (ADR 0004) with the duration and height from /meta.
 */
export interface Choice {
  /** First day of the Window, `YYYY-MM-DD` in UTC. */
  startDay: string | null
  hours: number | null
  heightM: number | null
}

export const DEFAULT_CHOICE: Choice = { startDay: null, hours: null, heightM: null }

export function isDefaultChoice(choice: Choice): boolean {
  return choice.startDay === null && choice.hours === null && choice.heightM === null
}

/** `YYYY-MM-DD` of an instant, in UTC. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The Query to ask. With the default Choice it is the Query the app opens on, with the Window
 * starting at 00:00 UTC of today (ADR 0004), so every visitor of the day asks the same Query and
 * the cache answers it.
 */
export function buildQuery(meta: Meta, now: Date, site: SiteRef | null = null, choice: Choice = DEFAULT_CHOICE): Query {
  return {
    site: isCoordinate(site) ? site : site || meta.defaults.site_id,
    start: choice.startDay ? new Date(`${choice.startDay}T00:00:00Z`) : new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS),
    durationHours: choice.hours ?? meta.defaults.duration_hours,
    observerHeightM: choice.heightM ?? meta.defaults.observer_height_m,
  }
}

type Coverage = Meta['coverage']

/** The longest Window, in whole days, that the engine takes. */
export function maxDays(coverage: Coverage): number {
  return Math.floor(coverage.max_duration_hours / 24)
}

/** First and last start days a Window of `hours` can have and still end inside the coverage. */
export function startDayRange(coverage: Coverage, hours: number): { min: string; max: string } {
  const minMs = Date.parse(coverage.window_min)
  const lastMs = Date.parse(coverage.window_max) - hours * 3_600_000
  const lastDayMs = Math.floor(lastMs / DAY_MS) * DAY_MS
  return { min: utcDay(Math.ceil(minMs / DAY_MS) * DAY_MS), max: utcDay(Math.max(lastDayMs, minMs)) }
}

export const HEIGHT_MIN_M = 0
export const HEIGHT_MAX_M = 50

/** The Landing scatter radii the API takes. */
export const RADIUS_MIN_M = 40
export const RADIUS_MAX_M = 1000

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readView(value: string | null): View {
  return value === 'ground' || value === 'map' ? value : 'orbit'
}

export type View = 'orbit' | 'map' | 'ground'

/** The answer screen, or the Proof page in its place. */
export type Page = 'answer' | 'proof'

/** What the link carries besides the Query: enough to reopen the same screen. */
export interface LinkState extends Choice {
  /** null is the default Site. A custom Site travels as `lat` and `lon` instead of `site`. */
  site: SiteRef | null
  cursorMs: number | null
  language: 'en' | 'pt' | null
  view: View
  page: Page
  /** Whether "Stats for nerds" is open. */
  stats: boolean
  /** Whether the Details drawer is open over the globe. */
  details?: boolean
  /** Outer radius of the Landing scatter; null is the default. Kept by its panel, not by the App. */
  radiusM?: number | null
}

export function readLink(search: string): LinkState {
  const params = new URLSearchParams(search)
  const stamp = params.get('t')
  const cursorMs = stamp ? Date.parse(stamp) : NaN
  const language = params.get('lang')
  const startDay = params.get('start')
  // An empty value is no value: Number('') would read as 0.
  const numberParam = (name: string) => {
    const raw = params.get(name)?.trim()
    return raw ? Number(raw) : NaN
  }
  const hours = numberParam('hours')
  const height = numberParam('height')
  // Any coordinate on the Moon is read back; whether the engine covers it is the API's answer to give.
  const lat = numberParam('lat')
  const lon = numberParam('lon')
  const radius = numberParam('radius')
  const coordinate =
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { latitudeDeg: lat, longitudeDeg: lon }
      : null
  return {
    startDay: startDay && /^\d{4}-\d{2}-\d{2}$/.test(startDay) && Number.isFinite(Date.parse(startDay)) ? startDay : null,
    hours: Number.isFinite(hours) && hours > 0 ? hours : null,
    heightM: Number.isFinite(height) && height >= HEIGHT_MIN_M && height <= HEIGHT_MAX_M ? height : null,
    site: params.get('site') || coordinate,
    cursorMs: Number.isFinite(cursorMs) ? cursorMs : null,
    language: language === 'en' || language === 'pt' ? language : null,
    view: readView(params.get('view')),
    page: params.get('page') === 'proof' ? 'proof' : 'answer',
    stats: params.get('stats') === '1',
    // Only when the link has it, so a link without it reads back exactly as before.
    ...(params.get('details') === '1' ? { details: true } : {}),
    // Only when the link has one, so a link without it reads back exactly as before.
    ...(Number.isFinite(radius) && radius >= RADIUS_MIN_M && radius <= RADIUS_MAX_M ? { radiusM: radius } : {}),
  }
}

/** The parameters `writeLink` owns. Any other one belongs to a panel and is carried over by `keep`. */
const LINK_KEYS = new Set(['lat', 'lon', 'site', 't', 'lang', 'view', 'start', 'hours', 'height', 'stats', 'details', 'page', 'radius'])

/**
 * The query string for a state. Defaults are left out, so the plain address stays the plain screen.
 * `keep` is the current query string: the panels' own settings in it ride along unchanged.
 */
export function writeLink(state: LinkState, keep = ''): string {
  const params = new URLSearchParams()
  for (const [name, value] of new URLSearchParams(keep)) {
    if (!LINK_KEYS.has(name)) params.append(name, value)
  }
  if (isCoordinate(state.site)) {
    params.set('lat', String(state.site.latitudeDeg))
    params.set('lon', String(state.site.longitudeDeg))
  } else if (state.site) {
    params.set('site', state.site)
  }
  if (state.cursorMs !== null) params.set('t', new Date(state.cursorMs).toISOString().replace(/\.\d{3}Z$/, 'Z'))
  if (state.language) params.set('lang', state.language)
  if (state.view !== 'orbit') params.set('view', state.view)
  if (state.startDay) params.set('start', state.startDay)
  if (state.hours !== null) params.set('hours', String(state.hours))
  if (state.heightM !== null) params.set('height', String(state.heightM))
  if (state.stats) params.set('stats', '1')
  if (state.details) params.set('details', '1')
  if (state.radiusM != null) params.set('radius', String(state.radiusM))
  if (state.page === 'proof') params.set('page', 'proof')
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Where the Cursor starts: now, when the Window holds it; otherwise the Window start. */
export function initialCursor(windowStartMs: number, windowEndMs: number, nowMs: number): number {
  return nowMs >= windowStartMs && nowMs < windowEndMs ? nowMs : windowStartMs
}

export function clampCursor(ms: number, windowStartMs: number, windowEndMs: number): number {
  return Math.min(windowEndMs, Math.max(windowStartMs, ms))
}

/** Moves to a page in place: a history entry, so the browser's back button returns to the answer. */
export function goToPage(page: Page): void {
  const query = writeLink({ ...readLink(window.location.search), page }, window.location.search)
  window.history.pushState(null, '', `${window.location.pathname}${query}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Opens the Details drawer from outside the App (the assistant's sources): the link changes and the App follows it. */
export function openDetails(): void {
  const current = readLink(window.location.search)
  if (current.details) return
  const query = writeLink({ ...current, details: true }, window.location.search)
  window.history.replaceState(null, '', `${window.location.pathname}${query}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
