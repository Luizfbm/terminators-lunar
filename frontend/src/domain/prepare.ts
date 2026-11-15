/**
 * What the move to the ground waits for (the requirement): the view's code, and nothing else. The ground
 * data is asked for at the same time and never awaited: decoding its PNG is slow on a busy machine,
 * and the view draws the silhouette until it is in.
 */
export function prepareWith(code: () => Promise<unknown>, data: () => Promise<unknown>): Promise<void> {
  void data().catch(() => undefined)
  return code().then(
    () => undefined,
    () => undefined,
  )
}
