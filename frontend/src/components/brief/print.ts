import type { UncertaintyState } from '../../hooks/useUncertainty'

/** What printing needs from the browser window: `print`, and the fonts, whose load changes the layout. */
export interface PrintHost {
  print: () => void
  document?: { fonts?: { ready: Promise<unknown> } }
}

/**
 * Prints the sheet once the page's fonts are in, so the figure and the text are measured as they
 * will be drawn. The caller has already waited for the answer and the Uncertainty band.
 */
export async function printWhenLoaded(host: PrintHost): Promise<void> {
  try {
    await host.document?.fonts?.ready
  } catch {
    // A font that failed to load must not keep the sheet from printing.
  }
  host.print()
}

/** Why the Print button is not ready yet, or null when it is. The band is quiet (`none`) or in. */
export function printWait(loading: boolean, uncertainty: UncertaintyState): 'loading' | 'band' | null {
  if (loading) return 'loading'
  return uncertainty.status === 'computing' ? 'band' : null
}
