import { expect, test as base } from '@playwright/test'

/**
 * The default layout (Larissa's) shows no header and no answer column. The specs of the controls that live
 * there open the app with `layout=classic`, which shows both as before. They do it from here and nowhere else:
 * a spec imports `test` and `expect` from './classic' instead of '@playwright/test', and every `page.goto`
 * in it gets the parameter. The specs of Larissa's layout keep importing from '@playwright/test'.
 *
 * For a single test of a spec that is otherwise on her layout, `classic(url)` returns the address to go to.
 */

/** The address with `layout=classic` added, before any `#fragment`. An absolute address to another site is left alone. */
export function classic(url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('http://127.0.0.1')) return url
  if (/[?&]layout=/.test(url)) return url
  const hash = url.indexOf('#')
  const path = hash === -1 ? url : url.slice(0, hash)
  const fragment = hash === -1 ? '' : url.slice(hash)
  return `${path}${path.includes('?') ? '&' : '?'}layout=classic${fragment}`
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page)
    page.goto = (url, options) => goto(classic(url), options)
    await provide(page)
  },
})

export { expect }
