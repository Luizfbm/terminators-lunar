import { ApiError, getTerrainHeights, type Site } from '../api/client'
import { siteTilesOf, tileCovering, type SiteTile } from '../domain/nearGround'
import { decodeGrey16 } from '../domain/png16'
import { heightMapOf, type HeightMap } from '../domain/terrain'
import { heightGridOf } from '../domain/terrainHeights'
import { versioned } from './moonSurface'

/** One level of the measured ground: its heights, and the images of its finer relief for the light. */
export interface GroundData {
  heights: HeightMap
  /** Normals finer than the heights, and a smaller copy for a phone where there is one. Either may be missing. */
  relief: string | null
  reliefSmall: string | null
}

const asked = new Map<string, Promise<GroundData | null>>()

/** One level of the published ground, described by `description`, fetched once and kept for the visit. */
function loadLevel(description: string): Promise<GroundData | null> {
  let level = asked.get(description)
  if (!level) {
    level = (async () => {
      try {
        const described = await fetch(versioned(description))
        if (!described.ok) return null
        const doc: unknown = await described.json()
        const file = (doc as { height_png?: { file?: unknown } }).height_png?.file
        if (typeof file !== 'string') return null
        const image = await fetch(versioned(file))
        if (!image.ok) return null
        const { width, height, data } = await decodeGrey16(new Uint8Array(await image.arrayBuffer()))
        const heights = width === height ? heightMapOf(doc, data, width) : null
        if (!heights) return null
        const files = (doc as { files?: { normal?: unknown; normal_small?: unknown } }).files
        const name = (value: unknown) => (typeof value === 'string' ? versioned(value) : null)
        return { heights, relief: name(files?.normal), reliefSmall: name(files?.normal_small) }
      } catch {
        return null
      }
    })()
    asked.set(description, level)
  }
  return level
}

/**
 * The ground around the pole: LOLA heights every 90 m, out to about 92 km from it. null when the
 * files are not there or do not read as expected: the view from the ground keeps its silhouette.
 */
export const loadGround = () => loadLevel('south_pole_fine.json')

/**
 * The ground of the whole south polar cap: LOLA heights every 148 m, out to 304 km from the pole,
 * down to 80°S. A 22 MB file, so it is asked for only where it is worth the wait.
 */
export const loadWideGround = () => loadLevel('south_cap.json')

let siteIndex: Promise<SiteTile[] | null> | null = null
const siteTiles = new Map<string, Promise<GroundData | null>>()

/** The square of a height map, read from its PNG with what its entry says. */
async function readTile(tile: SiteTile): Promise<GroundData | null> {
  try {
    const image = await fetch(versioned(tile.file))
    if (!image.ok) return null
    const { width, height, data } = await decodeGrey16(new Uint8Array(await image.arrayBuffer()))
    const heights = width === height ? heightMapOf(tile.doc, data, width) : null
    return heights ? { heights, relief: null, reliefSmall: null } : null
  } catch {
    return null
  }
}

/**
 * The 20 m ground around a Site (the requirement): the published square of the DEM's own pixels that
 * holds it, or null where none does, or the files are not there. The index is asked for once;
 * each square once per visit.
 */
export function loadSiteGround(latitudeDeg: number, longitudeDeg: number): Promise<GroundData | null> {
  siteIndex ??= (async () => {
    try {
      const answer = await fetch(versioned('site_20m.json'))
      return answer.ok ? siteTilesOf(await answer.json()) : null
    } catch {
      return null
    }
  })()
  return siteIndex.then((tiles) => {
    const tile = tiles && tileCovering(tiles, latitudeDeg, longitudeDeg)
    if (!tile) return null
    let level = siteTiles.get(tile.id)
    if (!level) {
      level = readTile(tile)
      siteTiles.set(tile.id, level)
    }
    return level
  })
}

/** The ground of the engine's DEM around a Site, or why there is none: the problem `code` of the answer. */
export type PatchGround = { ok: true; ground: GroundData; product: string; resolutionM: number } | { ok: false; code: string }

/** Grids kept for the visit: a few, each up to half a megabyte of heights. */
const PATCHES_KEPT = 4
const patches = new Map<string, Promise<PatchGround>>()

/**
 * The grid of `/terrain/heights` around a Site, for the view from the ground where no published
 * polar map holds it. Asked once per Site and kept; a failure is not kept, so the next view asks again.
 */
export function loadPatchGround(site: Pick<Site, 'id' | 'curated' | 'latitude_deg' | 'longitude_deg'>): Promise<PatchGround> {
  const key = site.curated ? `site:${site.id}` : `at:${site.latitude_deg},${site.longitude_deg}`
  let asked = patches.get(key)
  if (!asked) {
    asked = (async (): Promise<PatchGround> => {
      try {
        const grid = heightGridOf(await getTerrainHeights(site, new AbortController().signal))
        if (!grid) return { ok: false, code: 'unknown' }
        return { ok: true, ground: { heights: grid.heights, relief: null, reliefSmall: null }, product: grid.product, resolutionM: grid.resolutionM }
      } catch (cause) {
        return { ok: false, code: cause instanceof ApiError ? cause.code : 'network' }
      }
    })()
    patches.set(key, asked)
    while (patches.size > PATCHES_KEPT) patches.delete(patches.keys().next().value as string)
    void asked.then((answer) => {
      if (!answer.ok && patches.get(key) === asked) patches.delete(key)
    })
  }
  return asked
}
