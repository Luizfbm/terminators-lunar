import { en } from './strings'

type CatalogueKey = keyof typeof en
type ShortKey<K> = K extends `miss.${infer Name}` ? Name : never

/** The panel's copy by short name, read through the app's catalogue so the language on screen applies. */
export type MissStrings = Record<ShortKey<CatalogueKey>, string>

/** Every `miss.*` template, placeholders left in, for `fill` and the sentences that set values apart. */
export function missStrings(t: (key: CatalogueKey) => string): MissStrings {
  const keys = Object.keys(en) as CatalogueKey[]
  return Object.fromEntries(keys.map((key) => [key.slice('miss.'.length), t(key)])) as MissStrings
}

export function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}
