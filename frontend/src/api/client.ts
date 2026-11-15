import { isCoordinate, type Query, type SiteRef } from '../domain/query'
import type { components } from './schema'

export type Meta = components['schemas']['Meta']
export type VisibilityResult = components['schemas']['VisibilityResult']
export type Site = components['schemas']['Site']
export type Region = components['schemas']['Region']
export type VisibilityEvent = components['schemas']['Event']
export type Occluder = components['schemas']['Occluder']
export type LadderResult = components['schemas']['LadderResult']
export type SiteYear = components['schemas']['SiteYear']
export type Validation = components['schemas']['Validation']
export type TerrainHeights = components['schemas']['TerrainHeights']

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://lunar-api.luizfbm.win'
).replace(/\/$/, '')

/** Carries the problem `code` (or a transport marker) so the UI can translate it. */
export class ApiError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'ApiError'
    this.code = code
  }
}

export async function getJson<T>(path: string, params: URLSearchParams, signal: AbortSignal): Promise<T> {
  const query = params.toString()
  const url = `${API_BASE_URL}${path}${query ? `?${query}` : ''}`
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiError('network')
  }
  if (!response.ok) throw new ApiError(await problemCode(response))
  return (await response.json()) as T
}

async function problemCode(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as { code?: unknown }
    if (typeof problem.code === 'string') return problem.code
  } catch {
    // Not a problem document; fall through to the generic code.
  }
  return 'unknown'
}

/** The contract's Window instants carry whole seconds, so drop the milliseconds. */
export function toApiInstant(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function getMeta(signal: AbortSignal): Promise<Meta> {
  return getJson<Meta>('/meta', new URLSearchParams(), signal)
}

export function getSites(signal: AbortSignal): Promise<Site[]> {
  return getJson<Site[]>('/sites', new URLSearchParams(), signal)
}

export function getRegions(signal: AbortSignal): Promise<Region[]> {
  return getJson<Region[]>('/regions', new URLSearchParams(), signal)
}

/** A Curated Site goes by its code; a custom Site by its coordinate, never both (ambiguous_site). */
export function siteParams(site: SiteRef): Record<string, string> {
  return isCoordinate(site)
    ? { latitude_deg: String(site.latitudeDeg), longitude_deg: String(site.longitudeDeg) }
    : { site_id: site }
}

export function getVisibility(query: Query, signal: AbortSignal): Promise<VisibilityResult> {
  const params = new URLSearchParams({
    ...siteParams(query.site),
    start: toApiInstant(query.start),
    duration_hours: String(query.durationHours),
    observer_height_m: String(query.observerHeightM),
  })
  return getJson<VisibilityResult>('/visibility', params, signal)
}

/** The same Query on the Resolution ladder (three engine runs, so asked only when opened). */
export function getLadder(query: Query, signal: AbortSignal): Promise<LadderResult> {
  const params = new URLSearchParams({
    ...siteParams(query.site),
    start: toApiInstant(query.start),
    duration_hours: String(query.durationHours),
    observer_height_m: String(query.observerHeightM),
  })
  return getJson<LadderResult>('/visibility/ladder', params, signal)
}

/** One calendar year at a Curated Site, month by month. */
export function getYear(siteId: string, year: number, observerHeightM: number, signal: AbortSignal): Promise<SiteYear> {
  const params = new URLSearchParams({ year: String(year), observer_height_m: String(observerHeightM) })
  return getJson<SiteYear>(`/sites/${encodeURIComponent(siteId)}/year`, params, signal)
}

/**
 * The DEM's own heights around a Site, for the view from the ground where no published polar map
 * holds it. A Curated Site by its code, so the engine reads its own window; a typed point by its coordinate.
 */
export function getTerrainHeights(site: Pick<Site, 'id' | 'curated' | 'latitude_deg' | 'longitude_deg'>, signal: AbortSignal): Promise<TerrainHeights> {
  const params: Record<string, string> = site.curated
    ? { site_id: site.id }
    : { latitude_deg: String(site.latitude_deg), longitude_deg: String(site.longitude_deg) }
  return getJson<TerrainHeights>('/terrain/heights', new URLSearchParams(params), signal)
}

export function getValidations(signal: AbortSignal): Promise<Validation[]> {
  return getJson<Validation[]>('/validations', new URLSearchParams(), signal)
}
