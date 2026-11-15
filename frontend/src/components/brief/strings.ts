// The printable brief, in both languages. Glossary terms as written in GLOSSARY.md. Kept beside the
// page and read through `briefText`, so the shared catalogues stay untouched.

import type { I18n } from '../../i18n/i18n'

export const en = {
  'brief.open': 'Printable brief',
  'brief.title': 'Printable brief',
  'brief.back': 'Back to the answer',
  'brief.print': 'Print',
  'brief.printWaiting': 'The Uncertainty band is still being worked out. Print is ready when it is done.',
  'brief.printLoading': 'The answer is still loading. Print is ready when it is here.',
  'brief.query': 'The Query',
  'brief.site': 'Site',
  'brief.coordinates': 'Coordinates',
  'brief.window': 'Window',
  'brief.windowValue': '{start} to {end} UTC ({hours})',
  'brief.height': 'Observer height',
  'brief.heightValue': '{height} m above the ground',
  'brief.answer': 'The answer',
  'brief.cursor': 'Read at the Cursor: {instant} UTC.',
  'brief.numbers': 'The numbers for this Window',
  'brief.countdown': 'Countdown',
  'brief.nextSunset': 'Next Sunset',
  'brief.nextEarthset': 'Next Earthset',
  'brief.countdownEvent': 'In {span}. {why}',
  'brief.noSunset': 'The Sun does not set again in this Window.',
  'brief.noEarthset': 'The Earth does not set again in this Window.',
  'brief.horizon': 'Horizon mask',
  'brief.horizonLabel': 'The Horizon mask all round {site}, unrolled from north to north, with the Sun’s and the Earth’s paths over the Window.',
  'brief.horizonCaption': 'Elevation against azimuth. Heights are stretched to show the relief.',
  'brief.legend.mask': 'Horizon mask',
  'brief.legend.sun': 'Sun’s path',
  'brief.legend.earth': 'Earth’s path',
  'brief.links': 'Links and sources',
  'brief.queryLink': 'Query',
  'brief.proofLink': 'How we know these numbers',
  'brief.engine': 'Engine version',
  'brief.generated': 'Generated',
  'brief.generatedValue': '{instant} UTC',
}

export const pt: Record<keyof typeof en, string> = {
  'brief.open': 'Resumo para imprimir',
  'brief.title': 'Resumo para imprimir',
  'brief.back': 'Voltar para a resposta',
  'brief.print': 'Imprimir',
  'brief.printWaiting': 'A Faixa de incerteza ainda está sendo calculada. A impressão fica pronta quando ela terminar.',
  'brief.printLoading': 'A resposta ainda está carregando. A impressão fica pronta quando ela chegar.',
  'brief.query': 'A Consulta',
  'brief.site': 'Local',
  'brief.coordinates': 'Coordenadas',
  'brief.window': 'Janela',
  'brief.windowValue': '{start} a {end} UTC ({hours})',
  'brief.height': 'Altura do observador',
  'brief.heightValue': '{height} m do chão',
  'brief.answer': 'A resposta',
  'brief.cursor': 'Lida no Cursor: {instant} UTC.',
  'brief.numbers': 'Os números desta Janela',
  'brief.countdown': 'Contagem regressiva',
  'brief.nextSunset': 'Próximo pôr do Sol',
  'brief.nextEarthset': 'Próxima vez que a Terra some',
  'brief.countdownEvent': 'Em {span}. {why}',
  'brief.noSunset': 'O Sol não se põe mais nesta Janela.',
  'brief.noEarthset': 'A Terra não some mais nesta Janela.',
  'brief.horizon': 'Máscara do horizonte',
  'brief.horizonLabel': 'A máscara do horizonte em volta de {site}, desenrolada de norte a norte, com os caminhos do Sol e da Terra ao longo da Janela.',
  'brief.horizonCaption': 'Elevação contra azimute. As alturas estão esticadas para o relevo aparecer.',
  'brief.legend.mask': 'Máscara do horizonte',
  'brief.legend.sun': 'Caminho do Sol',
  'brief.legend.earth': 'Caminho da Terra',
  'brief.links': 'Links e fontes',
  'brief.queryLink': 'Consulta',
  'brief.proofLink': 'Como sabemos estes números',
  'brief.engine': 'Versão do engine',
  'brief.generated': 'Gerado em',
  'brief.generatedValue': '{instant} UTC',
}

export type BriefKey = keyof typeof en

/** The brief's own catalogue for the language the app is in. */
export function briefText({ locale }: Pick<I18n, 'locale'>): (key: BriefKey, params?: Record<string, string>) => string {
  const catalogue = locale === 'pt' ? pt : en
  return (key, params) => catalogue[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)
}
