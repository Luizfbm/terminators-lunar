import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readLink } from '../../domain/query'
import { pickLocale } from '../../i18n/i18n'
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

/** The text of every span the page writes for one language, in order. */
function spans(lang: 'en' | 'pt'): string[] {
  return [...MARKUP.matchAll(new RegExp(`<span data-lang="${lang}" lang="${lang}">([^<]*)</span>`, 'g'))].map((match) =>
    decode(match[1]),
  )
}

describe('the Earthrise in index.html', () => {
  it('says the same words as its reference strings, in English and in Portuguese', () => {
    expect(spans('en')).toEqual([en.title, en.terrain, en.sun, en.earth, en.story])
    expect(spans('pt')).toEqual([pt.title, pt.terrain, pt.sun, pt.earth, pt.story])
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

  it('needs nothing from the network: no file, no library, a few kB', () => {
    expect(MARKUP).not.toMatch(/\b(src|href)=/)
    expect(CSS).not.toMatch(/url\(|@import/)
    expect(MARKUP.length + CSS.length).toBeLessThan(12_000)
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
      // The points are "x y" pairs; V takes a single number and is not one.
      const xs = [...d.matchAll(/(-?\d+) (-?\d+)/g)].map((match) => Number(match[1]))
      expect(Math.min(...xs), d).toBeLessThan(0)
      expect(Math.max(...xs), d).toBeGreaterThan(600)
      expect(d, d).toMatch(/^M-?\d+ 1[0-9]{2}V/)
    }
  })

  it('stands still for prefers-reduced-motion', () => {
    const still = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(still).toMatch(/\.earthrise__earth,[^{]*\{\s*animation: none;/)
    expect(still).toMatch(/\[data-state='leaving'\] \.earthrise__ridge \{\s*transform: none;/)
  })
})

describe('the language of the page before the code runs', () => {
  const source = PAGE.match(/<script id="earthrise-lang">([\s\S]*?)<\/script>/)?.[1] ?? ''
  // src/main.tsx sets these tags once React runs.
  const TAGS = { en: 'en-GB', pt: 'pt-BR' }

  const run = (search: string, language: string | undefined) => {
    const root = { lang: 'en' }
    new Function('location', 'navigator', 'document', source)({ search }, { language }, { documentElement: root })
    return root.lang
  }

  it('follows the rule the app uses: the link first, then the browser', () => {
    expect(source).not.toBe('')
    for (const search of ['', '?lang=pt', '?lang=en', '?lang=fr', '?site=x&lang=pt']) {
      for (const language of ['pt-BR', 'pt', 'PT-pt', 'en-US', 'fr-FR', '']) {
        const locale = readLink(search).language ?? pickLocale(language)
        expect(run(search, language), `${search} ${language}`).toBe(TAGS[locale])
      }
    }
  })

  it('reads a browser that names no language as English', () => {
    expect(run('', undefined)).toBe('en-GB')
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
