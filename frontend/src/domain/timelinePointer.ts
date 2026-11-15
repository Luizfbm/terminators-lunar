/** Convert a pointer over the plot (not its label column) to the Window's time. */
export function timeAtPointer(clientX: number, plotLeft: number, plotWidth: number, startMs: number, endMs: number): number {
  if (plotWidth <= 0 || endMs <= startMs) return startMs
  const fraction = Math.max(0, Math.min(1, (clientX - plotLeft) / plotWidth))
  return startMs + fraction * (endMs - startMs)
}
