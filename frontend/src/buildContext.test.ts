import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// regression: the deploy of main stopped at `npm run build` inside the web image. Two
// tests imported the contract's examples with a static import that climbed out to the
// contract folder, and deploy/Dockerfile.web copies only frontend/, so tsc could not find
// them (TS2307).
// Every local gate passed, because in a checkout the contract folder is right there.
// The build type-checks what tsconfig.json includes, so no import in those files may
// leave frontend/. A file read at run time (readFileSync) is not an import.
const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INCLUDED = ['src', 'e2e']
const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]*)\1/g

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('what the web image can build', () => {
  it('has no import that leaves frontend/, the only folder the image copies', () => {
    const files = INCLUDED.flatMap((dir) => sources(join(FRONTEND, dir)))
    expect(files.length).toBeGreaterThan(50)
    const escaping = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(IMPORT)]
        .map((match) => match[2])
        .filter((specifier) => relative(FRONTEND, resolve(dirname(file), specifier)).startsWith('..'))
        .map((specifier) => `${relative(FRONTEND, file)} imports ${specifier}`),
    )
    expect(escaping).toEqual([])
  })
})
