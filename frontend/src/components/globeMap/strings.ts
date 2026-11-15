// The words of the polar map's markers and readout, in both languages (the requirement).
// Glossary terms as written in GLOSSARY.md: Site is "Local" in Portuguese, Region "região".

const en = {
  regions: 'Regions on the map',
  region: '{name}, {count} Sites',
  regionOne: '{name}, 1 Site',
  allRegions: 'All regions',
  coordinate: '{lat}° {ns}, {lon}° {ew}',
  N: 'N',
  S: 'S',
  E: 'E',
  W: 'W',
  askMouse: 'double-click to ask about this point',
  askTouch: 'double-tap to ask about this point',
}

type Strings = typeof en

const pt: Strings = {
  regions: 'Regiões no mapa',
  region: '{name}, {count} Locais',
  regionOne: '{name}, 1 Local',
  allRegions: 'Todas as regiões',
  coordinate: '{lat}° {ns}, {lon}° {ew}',
  N: 'N',
  S: 'S',
  E: 'L',
  W: 'O',
  askMouse: 'dê dois cliques para consultar este ponto',
  askTouch: 'toque duas vezes para consultar este ponto',
}

export const STRINGS = { en, pt }
export type MapKey = keyof Strings

export function fill(text: string, params: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}
