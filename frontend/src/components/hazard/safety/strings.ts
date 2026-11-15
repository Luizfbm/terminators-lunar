// Copy of the safety circle over the view from the ground, in English and Portuguese. It sits in this
// folder and is read by the locale, so the catalogue in src/i18n stays as it is.

import type { Locale } from '../../../i18n/messages'

export const en = {
  circle: 'Safety circle, {radius} around the Site',
  seal: 'Hazard not vetoed',
  normal: 'Normal navigation',
  multiresolution: 'Multiresolution {level}',
  change: '{change} against Normal navigation',
  around: 'Within {radius}: {over5} of {cells} cells are over {limit} at 5 m; {over60} at 60 m.',
  grid: 'The percentages belong to the grid nearest the Site ({grid}, {distance} km away), not to this exact point.',
  custom:
    'No hazard percentage here: the hazard grids are worked out for the Sites of the catalogue, not for a point you chose.',
  noGrid: 'No hazard percentage here: there is no 5 m grid within 15 km of this Site.',
  failed: 'The hazard percentage is not available right now.',
  metres: '{value} m',
  degrees: '{value}°',
}

export const pt: Record<keyof typeof en, string> = {
  circle: 'Círculo de segurança, {radius} ao redor do Local',
  seal: 'Perigo não vetado',
  normal: 'Navegação Normal',
  multiresolution: 'Multirresolução {level}',
  change: '{change} em relação à Navegação Normal',
  around: 'Num raio de {radius}: {over5} de {cells} células passam de {limit} a 5 m; {over60} a 60 m.',
  grid: 'As porcentagens são da grade mais próxima do Local ({grid}, a {distance} km), não deste ponto exato.',
  custom:
    'Sem porcentagem de perigo aqui: as grades de perigo são calculadas para os Locais do catálogo, não para um ponto escolhido.',
  noGrid: 'Sem porcentagem de perigo aqui: não há grade de 5 m a menos de 15 km deste Local.',
  failed: 'A porcentagem de perigo não está disponível agora.',
  metres: '{value} m',
  degrees: '{value}°',
}

export type SafetyStrings = typeof en

export function stringsFor(locale: Locale): SafetyStrings {
  return locale === 'pt' ? pt : en
}

export function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}
