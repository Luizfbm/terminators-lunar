// Every string of the DSN link panel and its band on the timeline, in both languages.
// Glossary terms as written in GLOSSARY.md.

const en = {
  open: 'Can a dish on Earth hear this Site?',
  loading: 'Working out when the dishes on Earth can see the Moon…',
  sayGap:
    'The Earth is visible for {earth}. For {link} of that time at least one 70 m dish of the Deep Space Network has the Moon in view. For the other {gap}, the Earth is up but none of the three dishes can see the Moon.',
  sayQuiet:
    'The DSN link is almost the same as Earth visible: of the {earth} with the Earth up, only {gap} go by with no 70 m dish that can see the Moon.',
  sayNone:
    'The DSN link is the same as Earth visible here: whenever the Earth is up, at least one of the three 70 m dishes can see the Moon.',
  empty: 'The Earth stays below the horizon for the whole Window, so no dish can hear this Site.',
  tableCaption: 'Earth visible and the DSN link in this Window',
  rowEarth: 'Earth visible',
  rowLink: 'DSN link',
  rowGap: 'Earth visible, no dish',
  ofEarth: '{share} of Earth visible',
  stations: 'When each dish has the Moon above {min}°',
  goldstone: 'Goldstone',
  canberra: 'Canberra',
  madrid: 'Madrid',
  stationSummary: '{count} passes · {hours}',
  stationSummaryOne: '1 pass · {hours}',
  stationNone: 'Never above {min}° in this Window',
  stationsShow: 'When each dish sees the Moon',
  stationsHide: 'Hide the dishes',
  passesShow: 'Every pass',
  passesHide: 'Hide the passes',
  passStart: 'From',
  passEnd: 'To',
  passLength: 'Length',
  passesCaption: 'Passes of {station}',
  limits:
    'This is geometry only. A dish counts when the Moon is at least {min}° above its horizon, and the Moon’s centre stands in for the Site, which is never more than 0.27° away from it. The app does not know the antennas’ schedule, the link budget or the terrain around the stations.',
  rowName: 'DSN',
  legend: 'On the timeline, the DSN row shows Earth visible with a 70 m dish that has the Moon above {min}°. The dark notches are Earth visible with no dish.',
}

type Strings = typeof en

const pt: Strings = {
  open: 'Alguma antena na Terra escuta este Local?',
  loading: 'Calculando quando as antenas na Terra veem a Lua…',
  sayGap:
    'A Terra fica visível por {earth}. Em {link} desse tempo, pelo menos uma antena de 70 m da Deep Space Network tem a Lua à vista. Nas outras {gap}, a Terra está no céu, mas nenhuma das três antenas vê a Lua.',
  sayQuiet:
    'O link DSN é quase igual a Terra visível: das {earth} com a Terra no céu, só {gap} passam sem nenhuma antena de 70 m que veja a Lua.',
  sayNone:
    'Aqui o link DSN é igual a Terra visível: sempre que a Terra está no céu, pelo menos uma das três antenas de 70 m vê a Lua.',
  empty: 'A Terra fica abaixo do horizonte a Janela inteira, então nenhuma antena consegue escutar este Local.',
  tableCaption: 'Terra visível e link DSN nesta Janela',
  rowEarth: 'Terra visível',
  rowLink: 'Link DSN',
  rowGap: 'Terra visível, sem antena',
  ofEarth: '{share} de Terra visível',
  stations: 'Quando cada antena tem a Lua acima de {min}°',
  goldstone: 'Goldstone',
  canberra: 'Canberra',
  madrid: 'Madri',
  stationSummary: '{count} passagens · {hours}',
  stationSummaryOne: '1 passagem · {hours}',
  stationNone: 'Nunca acima de {min}° nesta Janela',
  stationsShow: 'Quando cada antena vê a Lua',
  stationsHide: 'Esconder as antenas',
  passesShow: 'Todas as passagens',
  passesHide: 'Esconder as passagens',
  passStart: 'De',
  passEnd: 'Até',
  passLength: 'Duração',
  passesCaption: 'Passagens de {station}',
  limits:
    'Isto é só geometria. Uma antena conta quando a Lua está pelo menos {min}° acima do horizonte dela, e o centro da Lua faz as vezes do Local, que nunca fica a mais de 0,27° dele. O app não conhece a agenda das antenas, o orçamento de enlace nem o relevo em volta das estações.',
  rowName: 'DSN',
  legend: 'Na linha do tempo, a linha DSN mostra Terra visível com uma antena de 70 m que tem a Lua acima de {min}°. Os entalhes escuros são Terra visível sem antena.',
}

export const STRINGS = { en, pt }
export type DsnKey = keyof Strings

/** Fills `{name}` placeholders, as the app catalogue does. */
export function fill(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}
