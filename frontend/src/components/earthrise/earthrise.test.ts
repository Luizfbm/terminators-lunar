import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { en as appEn, pt as appPt } from '../../i18n/messages'
import { readyToHandOver, stepsFor, type Seen } from './handover'
import { en, pt } from './strings'

// the requirement: the page opens on an Earthrise written into index.html, before any code arrives.
const PAGE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../index.html'), 'utf8')

function between(start: string, end: string): string {
  const from = PAGE.indexOf(start)
  const to = PAGE.indexOf(end)
  expect(from, start).toBeGreaterThan(-1)
  expect(to, end).toBeGreaterThan(from)
  return PAGE.slice(from, to)
}

const MARKUP = between('<!-- earthrise:markup:start', '<!-- earthrise:markup:end')
const CSS = between('<!-- earthrise:css:start', '<!-- earthrise:css:end')

const decode = (html: string) => html.replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&')

/** The x of every point of an absolute path made of M, L, C, V and z (the ridge's silhouettes). */
function pathXs(d: string): number[] {
  const xs: number[] = []
  for (const [, command, args] of d.matchAll(/([MLCVz])([^MLCVz]*)/g)) {
    if (command === 'V' || command === 'z') continue
    const numbers = [...args.matchAll(/-?\d*\.?\d+/g)].map((match) => Number(match[0]))
    // M and L take one point, C three: the x is every other number.
    for (let i = 0; i < numbers.length; i += 2) xs.push(numbers[i])
  }
  return xs
}

/** The text of every span the page writes for one language, in order. */
function spans(lang: 'en' | 'pt'): string[] {
  return [...MARKUP.matchAll(new RegExp(`<span data-lang="${lang}" lang="${lang}">([^<]*)</span>`, 'g'))].map((match) =>
    decode(match[1]),
  )
}

describe('the Earthrise in index.html', () => {
  it('ships only English opening copy', () => {
    expect(spans('en')).toEqual([en.title, en.terrain, en.sun, en.earth, en.story])
    expect(spans('pt')).toEqual([])
    expect(MARKUP).not.toMatch(/Carregando|relevo|missão|caminho/)
  })

  it('names the wait the way the stage does once the app runs', () => {
    expect(en.title).toBe(appEn['stage.loading'])
    expect(pt.title).toBe(appPt['stage.loading'])
  })

  it('keeps the numbers of the story glued to their units', () => {
    expect(en.story).toMatch(/20\u00a0m\b/)
    expect(en.story).toMatch(/13\u00a0hours/)
    expect(pt.story).toMatch(/20\u00a0m\b/)
    expect(pt.story).toMatch(/13\u00a0horas/)
  })

  it('lists the three steps, all waiting until the code says otherwise', () => {
    const steps = [...MARKUP.matchAll(/data-step="(\w+)" data-state="(\w+)"/g)].map((match) => [match[1], match[2]])
    expect(steps).toEqual([
      ['terrain', 'waiting'],
      ['sun', 'waiting'],
      ['earth', 'waiting'],
    ])
  })

  it('is a picture for screen readers: the app announces the loading once, in its own status line', () => {
    expect(MARKUP).toMatch(/<div id="earthrise" class="earthrise" aria-hidden="true">/)
    expect(PAGE).not.toMatch(/role="status"|aria-live/)
  })

  it('needs nothing from the network: no file, no library, and the whole page stays small', () => {
    expect(MARKUP).not.toMatch(/\b(src|href)=/)
    expect(CSS).not.toMatch(/url\(|@import/)
    // The picture is drawn, not fetched, and paints before any code: index.html stays well under 40 kB gzipped.
    expect(gzipSync(PAGE).length).toBeLessThan(40_000)
  })

  // Validation check: the ridge was drawn inside a box capped at 720 px, so on a wide
  // page or a phone it showed as a rectangle with hard edges instead of the ground at the bottom.
  it('lays the ridge along the whole bottom of the page, past every edge', () => {
    expect(MARKUP).toMatch(/<svg class="earthrise__ridge" viewBox="0 0 600 100" preserveAspectRatio="none">/)
    const rule = CSS.match(/\.earthrise__ridge \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/position: absolute;/)
    expect(rule).toMatch(/left: 0;/)
    expect(rule).toMatch(/bottom: 0;/)
    expect(rule).toMatch(/width: 100%;/)
    expect(rule).not.toMatch(/max-width|min\(/)
    const land = CSS.match(/\.earthrise__land \{([^}]*)\}/)?.[1] ?? ''
    expect(land).toMatch(/left: 0;\s*right: 0;\s*bottom: 0;/)
    // Each filled shape of the ridge starts left of 0, ends right of 600 and reaches below 100.
    const ridge = MARKUP.slice(MARKUP.indexOf('<svg class="earthrise__ridge"'))
    const filled = [...ridge.matchAll(/<path fill="#[0-9a-f]+" d="([^"]+)"/g)].map((match) => match[1])
    expect(filled).toHaveLength(2)
    for (const d of filled) {
      const xs = pathXs(d)
      expect(Math.min(...xs), d).toBeLessThan(0)
      expect(Math.max(...xs), d).toBeGreaterThan(600)
      expect(d, d).toMatch(/^M-?\d+ 1[0-9]{2}V/)
    }
  })

  it('stands still for prefers-reduced-motion: the Earth, its clouds, the stars and the flag', () => {
    const still = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(still).toMatch(/\.earthrise__earth,[^{]*\{\s*animation: none;/)
    const list = still.slice(0, still.search(/\{\s*animation: none;/))
    for (const part of ['clouds', 'twinkle', 'cloth', 'folds']) expect(list, part).toContain(`.earthrise__${part}`)
    expect(still).toMatch(/\[data-state='leaving'\] \.earthrise__ridge \{\s*transform: none;/)
    expect(still).toMatch(/\[data-state='leaving'\] \.earthrise__regolith \{\s*transform: none;/)
  })

  it('has no animation that reduced motion leaves running', () => {
    const at = CSS.indexOf('@media (prefers-reduced-motion: reduce)')
    const outside = CSS.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, '')
    const still = CSS.slice(at)
    const animated = [...outside.matchAll(/([^{}]+)\{[^{}]*\banimation: (?!none)[^;]*;/g)].map((match) => match[1].trim())
    expect(animated.length).toBeGreaterThan(5)
    for (const selector of animated) expect(still, selector).toContain(selector)
  })
})

describe('the picture: the Earth, the ground and the flag', () => {
  const earth = MARKUP.slice(MARKUP.indexOf('class="earthrise__earth"'), MARKUP.indexOf('<svg class="earthrise__ridge"'))
  const flag = MARKUP.slice(MARKUP.indexOf('<svg class="earthrise__flag"'), MARKUP.indexOf('<div class="earthrise__text">'))

  it('draws the Earth with continents, clouds, a terminator and a thin atmosphere', () => {
    // Land: a filled outline of many points, not an ellipse stand-in.
    const land = earth.match(/<path fill="url\(#er-grass\)" d="([^"]+)"/)?.[1] ?? ''
    expect(land.length).toBeGreaterThan(1500)
    expect(land.match(/z/g)?.length).toBeGreaterThanOrEqual(8)
    expect(earth).toContain('class="earthrise__clouds"')
    // The night side is a soft crescent over the disc, and the limb has a rim.
    expect(earth).toMatch(/filter="url\(#er-soft\)"[^>]*d="M0-38A38 38 0 0 1 0 38A\d+ 38 0 0 0 0-38z"/)
    expect(earth).toMatch(/<circle r="38" fill="none" stroke="url\(#er-rim\)"/)
  })

  it('plants a small flag with the United States stripes in front of the ridge', () => {
    expect(MARKUP.indexOf('class="earthrise__regolith"')).toBeGreaterThan(MARKUP.indexOf('<svg class="earthrise__ridge"'))
    expect(flag).not.toBe('')
    // 13 stripes (a dashed line of 1.5 on, 1.5 off over 19.5 units) and a canton of 4 rows of stars.
    expect(flag).toMatch(/stroke-dasharray="1\.5 1\.5"/)
    expect(flag).toContain('M6 6.9H18M6 9.3H18M6 11.7H18M6 14.1H18')
    // Small, and standing on the near ground, which starts well below the top of the ridge's box.
    const rule = CSS.match(/\.earthrise__flag \{([^}]*)\}/)?.[1] ?? ''
    expect(Number(rule.match(/height: clamp\(\d+px, .*, (\d+)px\);/)?.[1])).toBeLessThanOrEqual(70)
    expect(Number(rule.match(/bottom: (\d+)%/)?.[1])).toBeGreaterThanOrEqual(40)
  })

  it('waves the cloth a few degrees and nothing else of the flag', () => {
    expect(CSS).toMatch(/\.earthrise__cloth \{[^}]*animation: earthrise-wave [\d.]+s ease-in-out infinite alternate;/)
    const wave = CSS.match(/@keyframes earthrise-wave \{([\s\S]*?)\n\s+@keyframes/)?.[1] ?? ''
    const skews = [...wave.matchAll(/skewY\((-?[\d.]+)deg\)/g)].map((match) => Math.abs(Number(match[1])))
    expect(skews).toHaveLength(2)
    for (const degrees of skews) expect(degrees).toBeLessThanOrEqual(4)
  })

  it('sinks the craters, rocks and flag with the ridge when it hands over', () => {
    expect(CSS).toMatch(/\[data-state='leaving'\] \.earthrise__regolith \{\s*transform: translateY\(100%\);/)
    expect(MARKUP.match(/class="earthrise__crater"/g)?.length).toBeGreaterThanOrEqual(5)
  })
})

describe('the language of the page before the code runs', () => {
  const source = PAGE.match(/<script id="earthrise-lang">([\s\S]*?)<\/script>/)?.[1] ?? ''
  // src/main.tsx sets these tags once React runs.

  const run = (search: string, language: string | undefined) => {
    const root = { lang: 'en' }
    new Function('location', 'navigator', 'document', source)({ search }, { language }, { documentElement: root })
    return root.lang
  }

  it('always uses American English, including old Portuguese links', () => {
    expect(source).not.toBe('')
    for (const search of ['', '?lang=pt', '?lang=en', '?lang=fr', '?site=x&lang=pt']) {
      for (const language of ['pt-BR', 'pt', 'PT-pt', 'en-US', 'fr-FR', '']) {
        expect(run(search, language), `${search} ${language}`).toBe('en-US')
      }
    }
  })

  it('reads a browser that names no language as English', () => {
    expect(run('', undefined)).toBe('en-US')
  })
})

describe('the steps and the hand over', () => {
  const seen = (over: Partial<Seen>): Seen => ({ answered: false, globe: false, dressed: false, waiting: true, ...over })

  it('ticks the paths with the first answer and the terrain with the dressed Moon', () => {
    expect(stepsFor(seen({}))).toEqual({ terrain: 'waiting', sun: 'loading', earth: 'loading' })
    expect(stepsFor(seen({ answered: true }))).toEqual({ terrain: 'waiting', sun: 'done', earth: 'done' })
    expect(stepsFor(seen({ answered: true, globe: true }))).toEqual({ terrain: 'loading', sun: 'done', earth: 'done' })
    expect(stepsFor(seen({ answered: true, globe: true, dressed: true }))).toEqual({ terrain: 'done', sun: 'done', earth: 'done' })
  })

  it('hands over as soon as nothing on the stage waits, with no minimum time', () => {
    expect(readyToHandOver(seen({ answered: true, globe: true }))).toBe(false)
    expect(readyToHandOver(seen({ answered: true, globe: true, dressed: true, waiting: false }))).toBe(true)
    // An error, or a browser that cannot draw: nothing left to wait for, though no Moon came.
    expect(readyToHandOver(seen({ waiting: false }))).toBe(true)
  })
})
