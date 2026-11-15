import { describe, expect, it } from 'vitest'
import { countByStatus, orderValidations, type Validation } from './proof'

const text = (value: string) => ({ en: value, pt: value })
const check = (id: string, status: Validation['status']): Validation => ({
  id,
  title: text(id),
  reference: 'ref',
  tolerance: text('tol'),
  result: text('res'),
  status,
  not_covered: text('none'),
  script_path: 'validation/x.py',
  run_at: '2026-11-15T13:02:11Z',
})

describe('the Proof page order', () => {
  it('puts failures first, then pending, then passes, keeping the order inside each', () => {
    const list = [check('a', 'passed'), check('b', 'failed'), check('c', 'pending'), check('d', 'failed'), check('e', 'passed')]
    expect(orderValidations(list).map((v) => v.id)).toEqual(['b', 'd', 'c', 'a', 'e'])
  })

  it('counts each status, zero included', () => {
    expect(countByStatus([check('a', 'passed'), check('b', 'passed'), check('c', 'failed')])).toEqual({
      passed: 2,
      failed: 1,
      pending: 0,
    })
  })
})
