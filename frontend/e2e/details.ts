import { expect, type Locator, type Page } from '@playwright/test'

// The answer is a card over the globe (the headline and the Countdown to the next Sunset and Earthset) and
// a drawer with everything else: the Query line, the metrics, the panels, "Stats for nerds" and the way to
// the Proof. The drawer is a modal dialog: while it is open the rest of the page is inert, so a test that
// reads the drawer and then drives the stage or the time strip closes it first.

/** The drawer's name in both languages. */
export const DETAILS_NAME = /^(Details|Detalhes)$/

/** The drawer of details, whether or not it is open. */
export const details = (page: Page): Locator => page.getByRole('dialog', { name: DETAILS_NAME })

/** The card over the globe: the headline, the Countdown and the Details button. */
export const card = (page: Page): Locator => page.getByRole('region', { name: /^(Answer|Resposta)$/ })

/** The address with `details=1` in it, so the page opens with the drawer open. */
export function withDetails(path = '/'): string {
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('details', '1')
  return `${base}?${params.toString()}`
}

/** Opens the drawer from the card's button, unless it is open already. */
export async function openDetails(page: Page): Promise<Locator> {
  const button = page.locator('.card__details')
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  await expect(details(page)).toBeVisible()
  return details(page)
}

/** Closes the drawer with Esc, which hands the focus back to the Details button. */
export async function closeDetails(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(details(page)).toBeHidden()
}
