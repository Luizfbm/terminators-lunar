import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { askHome, STRIP_QUERY } from './placement'

// the requirement: on a 390×844 phone the floating "Ask" button sat over the headline, the landing
// calendar, the miss table and the custom point's "Check". It never floats now: on a narrow screen
// it lives in the time strip, and it steps aside while the Site picker or a dialog is open.
// Playwright measures the boxes (e2e/ask-button.spec.ts); these check the rules that place it.

const css = readFileSync(new URL('./assistant.css', import.meta.url), 'utf8')
  // Comments say "position: fixed" in prose; only the rules count.
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Every rule as its selector and its declarations, media queries flattened. */
function rules(source: string): { selector: string; body: string }[] {
  const found: { selector: string; body: string }[] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  for (const match of source.matchAll(pattern)) found.push({ selector: match[1]!.trim(), body: match[2]! })
  return found
}

const buttonRules = rules(css).filter((rule) => rule.selector.includes('.ask-button'))

describe('the Ask button on a phone (the requirement)', () => {
  // Validation check: `position: fixed` at (296, 677) covered text and the custom point's Check.
  it('is never taken out of the flow to float over the page', () => {
    expect(buttonRules.length).toBeGreaterThan(0)
    for (const rule of buttonRules) expect(rule.body, rule.selector).not.toMatch(/position:\s*(fixed|absolute|sticky)/)
  })

  // Validation check: at 1366×768 the button in the top bar kept `margin: -12px 0`, so
  // its 44 px box hung 12 px below the bar, which is drawn above the page, over the answer's first
  // line once the answer scrolled.
  it('never hangs below its own row, so it cannot lie over the answer under the top bar', () => {
    for (const rule of buttonRules) {
      for (const [, property, value] of rule.body.matchAll(/(margin(?:-bottom)?):\s*([^;]+);/g)) {
        const parts = value!.trim().split(/\s+/)
        const bottom = property === 'margin-bottom' ? parts[0]! : (parts[2] ?? parts[0])!
        expect(bottom, `${rule.selector} { ${property}: ${value} }`).not.toMatch(/^-/)
      }
    }
  })

  it('goes into the time strip on a narrow screen when the strip is there, and stays in the top bar otherwise', () => {
    const slot = {} as Element
    expect(askHome(true, slot)).toBe(slot)
    expect(askHome(true, null)).toBeNull()
    expect(askHome(false, slot)).toBeNull()
    expect(askHome(false, null)).toBeNull()
  })

  it('moves at the same width where the strip makes room for it', () => {
    const width = STRIP_QUERY.match(/max-width:\s*(\d+)px/)?.[1]
    expect(width).toBeDefined()
    const media = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
    const stripLayout = media.find((block) => block[2]!.includes('.strip__ask'))
    expect(stripLayout?.[1]).toBe(width)
  })

  // The picker's list is drawn at z-index 30 and the old button at 40, so Check sat under it.
  it('is hidden while the Site picker or another dialog is open', () => {
    const hiding = buttonRules.filter((rule) => /visibility:\s*hidden/.test(rule.body)).map((rule) => rule.selector)
    expect(hiding.some((selector) => selector.includes('.site-list'))).toBe(true)
    expect(hiding.some((selector) => selector.includes("[aria-haspopup='listbox'][aria-expanded='true']"))).toBe(true)
    expect(hiding.some((selector) => selector.includes('dialog[open]'))).toBe(true)
  })
})
