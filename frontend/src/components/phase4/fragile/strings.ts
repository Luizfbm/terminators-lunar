// Copy of the Fragile result line under the answer (issue 67), in English and Portuguese. Kept here and
// read by locale, not through the app's catalogue, so the line stays one self-contained piece.
// {limit} is the limit from `FRAGILE_CLEARANCE_DEG`, formatted by the app; {sun} and {earth} are spans.
import type { Locale } from '../../../i18n/messages'

export interface FragileStrings {
  both: string
  sun: string
  earth: string
  why: string
}

export const fragileStrings: Record<Locale, FragileStrings> = {
  en: {
    both: 'Fragile result: for {sun} of this Window the Sun passes less than {limit} from the terrain, and for {earth} the Earth. In those hours a small error in the terrain changes the answer.',
    sun: 'Fragile result: for {sun} of this Window the Sun passes less than {limit} from the terrain. In those hours a small error in the terrain changes the answer.',
    earth: 'Fragile result: for {earth} of this Window the Earth passes less than {limit} from the terrain. In those hours a small error in the terrain changes the answer.',
    why: 'why?',
  },
  pt: {
    both: 'Resultado frágil: por {sun} desta Janela o Sol passa a menos de {limit} do relevo, e por {earth} a Terra. Nessas horas um erro pequeno no relevo muda a resposta.',
    sun: 'Resultado frágil: por {sun} desta Janela o Sol passa a menos de {limit} do relevo. Nessas horas um erro pequeno no relevo muda a resposta.',
    earth: 'Resultado frágil: por {earth} desta Janela a Terra passa a menos de {limit} do relevo. Nessas horas um erro pequeno no relevo muda a resposta.',
    why: 'por quê?',
  },
}
