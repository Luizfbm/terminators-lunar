import { describe, expect, it } from 'vitest'
import { prepareWith } from './prepare'

describe('what the dive to the ground waits for (the requirement)', () => {
  it('is the code only: ground data still decoding never holds the move', async () => {
    // Validation check: the ready signal waited for the ground's PNG to be fetched and
    // decoded, slow on a busy machine, and the move from orbit took 2 s against its 1.2 s.
    let asked = false
    const never = () => {
      asked = true
      return new Promise<never>(() => undefined)
    }
    await expect(prepareWith(() => Promise.resolve('module'), never)).resolves.toBeUndefined()
    expect(asked).toBe(true)
  })

  it('resolves when the code fails too, so the move never waits for ever', async () => {
    await expect(prepareWith(() => Promise.reject(new Error('offline')), () => Promise.reject(new Error('offline')))).resolves.toBeUndefined()
  })
})
