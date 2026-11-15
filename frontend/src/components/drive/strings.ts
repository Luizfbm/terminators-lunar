// "Rover and drive" (issue #100): the one entry that opens Eduardo's screens. Only the words around them are
// here; each screen has its own catalogue. Glossary terms as written in GLOSSARY.md (Rover, Hazard grid,
// Normal navigation, Multiresolution, Curated Site). Plain data, picked by the app's language.
import type { Locale } from '../../i18n/messages'

export const en = {
  'drive.open': 'Rover and drive',
  'drive.title': 'Rover and drive',
  'drive.close': 'Close',
  'drive.tabs': 'Rover and drive screens',
  'drive.tab.rover': 'Rover',
  'drive.tab.hazard': 'Hazard inspector',
  'drive.tab.simulation': 'Simulation',
  'drive.tab.walk': 'Walk',
  'drive.needsSite':
    '{site} is a typed coordinate. The Hazard grid, the simulation and the walk belong to a Curated Site: pick one on the map.',
  'drive.nav.normal': 'Normal navigation',
  'drive.nav.multiresolution': 'Multiresolution',
  'drive.accepted': 'Plan accepted: {plan}.',
  'drive.toWalk': 'Walk the surface',
  'drive.planning': 'Planning the drive…',
}

export type DriveKey = keyof typeof en

export const pt: Record<DriveKey, string> = {
  'drive.open': 'Rover e travessia',
  'drive.title': 'Rover e travessia',
  'drive.close': 'Fechar',
  'drive.tabs': 'Telas de rover e travessia',
  'drive.tab.rover': 'Rover',
  'drive.tab.hazard': 'Inspetor de perigo',
  'drive.tab.simulation': 'Simulação',
  'drive.tab.walk': 'Caminhada',
  'drive.needsSite':
    '{site} é uma coordenada digitada. A grade de perigo, a simulação e a caminhada pertencem a um Local curado: escolha um no mapa.',
  'drive.nav.normal': 'Navegação Normal',
  'drive.nav.multiresolution': 'Multirresolução',
  'drive.accepted': 'Plano aceito: {plan}.',
  'drive.toWalk': 'Caminhar na superfície',
  'drive.planning': 'Planejando o trajeto…',
}

const CATALOGUES: Record<Locale, Record<DriveKey, string>> = { en, pt }

export function driveText(locale: Locale, key: DriveKey, params?: Record<string, string>): string {
  return CATALOGUES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)
}
