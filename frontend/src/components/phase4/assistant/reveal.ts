// Where each source of an answer shows on the screen (the requirement). The assistant is mounted with
// one element and no hold on the App's state, so it moves the screen the way a visitor would: the
// page through the link, "Stats for nerds" and its panels through their own buttons.
import { goToPage, readLink, writeLink } from '../../../domain/query'
import type { AssistantSource } from './types'

/** The panel inside "Stats for nerds" that shows an operation, by the label of its button. */
export type PanelLabels = Partial<Record<string, string>>

export function sourceHref(source: AssistantSource): string {
  const page = source.operation === 'listValidations' ? 'proof' : 'answer'
  return writeLink({ ...readLink(window.location.search), page }) || '?'
}

function press(button: HTMLButtonElement | null | undefined): void {
  if (button && button.getAttribute('aria-expanded') === 'false') button.click()
}

/** Opens the view behind `source` and puts the focus on it, so the reader lands where the number is. */
export function revealSource(source: AssistantSource, panels: PanelLabels): void {
  if (source.operation === 'listValidations') {
    goToPage('proof')
    return
  }
  if (readLink(window.location.search).page !== 'answer') goToPage('answer')
  // The answer page renders on the next frame after a page change; the nerds panel after its click.
  requestAnimationFrame(() => {
    if (source.operation === 'listSites' || source.operation === 'getSite') {
      // The Site picker is the first control of the Query line.
      const where = document.querySelector<HTMLElement>('.where button')
      where?.scrollIntoView({ block: 'center' })
      where?.focus()
      return
    }
    const nerds = document.querySelector<HTMLButtonElement>('.nerds__open')
    press(nerds)
    requestAnimationFrame(() => {
      const label = panels[source.operation]
      const panel = label
        ? Array.from(document.querySelectorAll<HTMLButtonElement>('.nerds__panel .panel__open')).find((button) => button.textContent?.trim() === label)
        : undefined
      press(panel)
      const target = panel ?? nerds
      target?.scrollIntoView({ block: 'start' })
      target?.focus()
    })
  })
}
