import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { en, pt, type MessageKey } from '../i18n/messages'
import { ERROR_SOURCES, NOT_CHECKED, type CaveatRow, type Reference } from './proofCaveats'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const flat = (text: string) => text.replace(/\s+/g, ' ')

interface ServedCheck {
  id: string
  title: Record<'en' | 'pt', string>
  reference: string
  tolerance: Record<'en' | 'pt', string>
  result: Record<'en' | 'pt', string>
  not_covered: Record<'en' | 'pt', string>
}
const CHECKS = JSON.parse(read('backend/app/data/validations.json')) as ServedCheck[]

function adrFile(number: string): string | undefined {
  const name = readdirSync(join(ROOT, 'docs/adr')).find((entry) => entry.startsWith(`${number}-`))
  return name && `docs/adr/${name}`
}

/** The text a reference stands for, or undefined when it points at nothing that exists. */
function sourceText(ref: Reference): string | undefined {
  if (ref.kind === 'paper') return ''
  if (ref.kind === 'check') {
    const found = CHECKS.find((check) => check.id === ref.value)
    if (!found) return undefined
    return [found.title.en, found.reference, found.tolerance.en, found.result.en, found.not_covered.en].join(' ')
  }
  const path = ref.kind === 'adr' ? adrFile(ref.value) : ref.value
  return path && existsSync(join(ROOT, path)) ? read(path) : undefined
}

const ALL: [string, readonly CaveatRow<string>[], (id: string) => MessageKey[]][] = [
  ['error source', ERROR_SOURCES, (id) => [`proof.err.${id}.name`, `proof.err.${id}.size`, `proof.err.${id}.effect`] as MessageKey[]],
  ['unchecked item', NOT_CHECKED, (id) => [`proof.todo.${id}`] as MessageKey[]],
]

describe('the Proof page summaries', () => {
  for (const [label, rows, keysOf] of ALL) {
    describe(`each ${label}`, () => {
      it('is written in both languages', () => {
        for (const row of rows) {
          for (const key of keysOf(row.id)) {
            expect(en[key], `${key} in English`).toBeTruthy()
            expect(pt[key], `${key} in Portuguese`).toBeTruthy()
          }
        }
      })

      it('cites at least one source, and every source exists', () => {
        for (const row of rows) {
          expect(row.refs.length, row.id).toBeGreaterThan(0)
          for (const ref of row.refs) {
            expect(sourceText(ref), `${row.id}: ${ref.kind} ${ref.value}`).toBeDefined()
          }
        }
      })

      it('states only numbers that are in its sources', () => {
        for (const row of rows) {
          const sources = flat(row.refs.map((ref) => sourceText(ref) ?? '').join(' '))
          for (const figure of row.figures) {
            expect(sources, `${row.id}: "${figure}"`).toContain(flat(figure))
          }
        }
      })
    })
  }

  it('lists the ids once', () => {
    for (const [, rows] of ALL) expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })

  // The issue: the ladder stops at 20 m, the 5 m product exists and is not used, and the horizon reaches 300 km.
  it('says where the Resolution ladder stops and how far the horizon reaches', () => {
    for (const catalogue of [en, pt]) {
      expect(catalogue['proof.err.dem.size']).toContain('20 m')
      expect(catalogue['proof.err.dem.size']).toContain('300 km')
      expect(catalogue['proof.err.reach.size']).toContain('300 km')
      expect(catalogue['proof.todo.ladder']).toContain('5 m')
      expect(catalogue['proof.todo.ladder']).toContain('20 m')
    }
  })

  it('has the same numbers in both languages', () => {
    const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')).sort()
    for (const [, rows, keysOf] of ALL) {
      for (const row of rows) {
        for (const key of keysOf(row.id)) expect(numbers(pt[key]), key).toEqual(numbers(en[key]))
      }
    }
  })
})
