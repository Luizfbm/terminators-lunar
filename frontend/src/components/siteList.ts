/** A stretch of a scroller's content, in pixels from the top of that content. */
export interface Span {
  top: number
  height: number
}

/**
 * The `scrollTop` that shows `item` inside `view` (the scroller's visible stretch). Centred when
 * the list opens, so the chosen Site sits in the middle with its neighbours around it (the requirement);
 * otherwise the least move that brings the item fully into view, as the arrow keys need.
 */
export function scrollTopToShow(view: Span, item: Span, centre: boolean): number {
  if (centre) return Math.max(0, item.top + item.height / 2 - view.height / 2)
  if (item.top < view.top) return item.top
  if (item.top + item.height > view.top + view.height) return item.top + item.height - view.height
  return view.top
}
