import { expect, type Page } from '@playwright/test'

/** Check visible copy and accessible names while the browser and old link request Portuguese. */
export async function assertEnglish(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  const copy = await page.evaluate(() => {
    const labels = [...document.querySelectorAll<HTMLElement>('[aria-label], [title], [placeholder]')]
      .filter(el => el.getClientRects().length > 0 && !el.closest('[hidden]'))
      .map(el => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder')].filter(Boolean).join(' '))
    return [document.body.innerText, ...labels].join('\n')
  })
  expect(copy).not.toMatch(/\b(Carregando|Voltar|Escolha|Bateria|Detalhes|Arraste|Veículo|Sítios|Pousar|Português|recarregue|Sol|Terra|Lua)\b|Não |Do chão|De órbita|janela escolhida|fora da precisão/i)
}
