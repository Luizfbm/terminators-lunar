import { useCallback, useEffect, useState } from 'react'
import { ApiError, getMeta, getValidations, type Meta, type Validation } from '../api/client'

export type ProofState =
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'ready'; validations: Validation[]; meta: Meta | null }

/** The latest validation run, and /meta for the provenance line. A missing /meta only drops that line. */
export function useValidations(): { state: ProofState; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{ attempt: number; state: ProofState } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getValidations(controller.signal), getMeta(controller.signal).catch(() => null)]).then(
      ([validations, meta]) => {
        if (!controller.signal.aborted) setSettled({ attempt, state: { status: 'ready', validations, meta } })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setSettled({ attempt, state: { status: 'error', code: error instanceof ApiError ? error.code : 'unknown' } })
      },
    )
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return { state: settled?.attempt === attempt ? settled.state : { status: 'loading' }, retry }
}
