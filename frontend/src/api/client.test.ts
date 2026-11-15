import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getJson } from './client'

afterEach(() => vi.unstubAllGlobals())

const answer = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))

const failure = () => getJson('/x', new URLSearchParams(), new AbortController().signal).catch((error: unknown) => error)

describe('getJson problems', () => {
  // Validation check: `/terrain` answers 422 `outside_coverage` for a DEM too coarse for the radius
  // and for no DEM at all; the screen could not tell them apart because only the code was kept.
  it('keeps the problem detail beside the code', async () => {
    answer(422, {
      type: 'x',
      title: 'Outside coverage',
      status: 422,
      code: 'outside_coverage',
      detail: 'The DEM is too coarse for this radius: ...',
    })
    const error = await failure()
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'outside_coverage', detail: 'The DEM is too coarse for this radius: ...' })
  })

  it('has no detail when the problem sends none, and the generic code for a body that is no problem', async () => {
    answer(422, { code: 'busy' })
    expect(await failure()).toMatchObject({ code: 'busy', detail: undefined })
    answer(500, { oops: true })
    expect(await failure()).toMatchObject({ code: 'unknown', detail: undefined })
  })
})
