/**
 * Where the focus goes on Tab inside the details drawer, so it stays in the drawer while it is open (the
 * drawer is a modal dialog). `index` is where the focus is now among the `count` controls of the drawer,
 * or -1 when it is on none of them; `backwards` is Shift+Tab. Returns the control to move to, or null
 * when the browser's own Tab step is already right.
 */
export function wrapFocus(index: number, count: number, backwards: boolean): number | null {
  if (count <= 0) return null
  if (index < 0) return backwards ? count - 1 : 0
  if (backwards && index === 0) return count - 1
  if (!backwards && index === count - 1) return 0
  return null
}
