import type { components } from '../api/schema'

export type Validation = components['schemas']['Validation']
export type ValidationStatus = Validation['status']

/** Failures first, then what has not run, then what passes: a judge sees the bad news first. */
export const STATUS_ORDER: readonly ValidationStatus[] = ['failed', 'pending', 'passed']

export function orderValidations(list: readonly Validation[]): Validation[] {
  return list
    .map((validation, index) => ({ validation, index }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.validation.status) - STATUS_ORDER.indexOf(b.validation.status) || a.index - b.index)
    .map(({ validation }) => validation)
}

export function countByStatus(list: readonly Validation[]): Record<ValidationStatus, number> {
  const counts: Record<ValidationStatus, number> = { passed: 0, failed: 0, pending: 0 }
  for (const validation of list) counts[validation.status] += 1
  return counts
}
