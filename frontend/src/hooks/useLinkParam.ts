import { useCallback, useEffect, useState } from 'react'

function read(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

/**
 * A panel's own setting, kept in the link under `name` so it survives a reload. The App's link
 * writer carries parameters it does not own, so the two never undo each other. null removes it.
 */
export function useLinkParam(name: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState(() => read(name))
  useEffect(() => {
    const follow = () => setValue(read(name))
    window.addEventListener('popstate', follow)
    return () => window.removeEventListener('popstate', follow)
  }, [name])
  const set = useCallback(
    (next: string | null) => {
      setValue(next)
      const params = new URLSearchParams(window.location.search)
      if (next === null) params.delete(name)
      else params.set(name, next)
      const text = params.toString()
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${text ? `?${text}` : ''}`)
    },
    [name],
  )
  return [value, set]
}
