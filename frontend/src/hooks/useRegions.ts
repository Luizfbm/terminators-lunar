import { useEffect, useState } from 'react'
import { getRegions, type Region } from '../api/client'

/** The Regions, for the group names in the Site list. An error leaves the codes in their place. */
export function useRegions(): Region[] {
  const [regions, setRegions] = useState<Region[]>([])
  useEffect(() => {
    const controller = new AbortController()
    getRegions(controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setRegions(list)
      },
      () => undefined,
    )
    return () => controller.abort()
  }, [])
  return regions
}
