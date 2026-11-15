// The rover and mission picker (issue #94). Glossary: Window, Observer height, Darkness tolerance,
// Mission fit, LCSP. The rovers' numbers, their estimated marks and their sources come from
// GET /rovers; only the words around them are here.
//
// The picker reads this file itself (`roverText`) instead of the app's catalogue, so it works
// wherever it is mounted. The keys are prefixed `rover.`, so the app can also spread `en` and `pt`
// into its catalogues the way the battery does.
import type { Locale } from '../../i18n/messages'

export const en = {
  'rover.title': 'Which rover, and for how long?',
  'rover.intro':
    'Pick a rover and a mission. The rover’s mast suggests an Observer height, and its Darkness tolerance is set against the longest night (LCSP) of the Window.',
  'rover.groups': 'Where the rover was built for',
  'rover.moon': 'Moon',
  'rover.mars': 'Mars',
  'rover.marsLabel': 'What if it went to the Moon?',
  'rover.marsNote': 'Built for Mars. The numbers are the rover’s own; the question is what would happen if it went to the Moon.',
  'rover.list': 'Rovers',
  'rover.prev': 'Previous rover',
  'rover.next': 'Next rover',
  'rover.loading': 'Loading the rovers…',
  'rover.error': 'The rovers could not be loaded.',
  'rover.retry': 'Try again',
  'rover.empty': 'There are no rovers to show.',
  'rover.cardDark': '{hours} h in the dark',
  'rover.cardRtg': 'RTG, no limit in the dark',
  'rover.mass': 'Mass',
  'rover.battery': 'Battery',
  'rover.panels': 'Solar panels',
  'rover.rtg': 'RTG (nuclear)',
  'rover.shadow': 'Power in shadow',
  'rover.mast': 'Mast',
  'rover.slope': 'Slope limit',
  'rover.dark': 'Darkness tolerance',
  'rover.none': 'none',
  'rover.noLimit': 'no limit',
  'rover.unitKg': 'kg',
  'rover.unitWh': 'Wh',
  'rover.unitW': 'W',
  'rover.unitM': 'm',
  'rover.unitDeg': '°',
  'rover.unitH': 'h',
  'rover.estimatedTitle': 'Estimated: the source does not give this number.',
  'rover.estimatedLegend': '* estimated, because the source does not give it',
  'rover.rtgCovers': 'The RTG covers the load, so the dark does not drain the battery.',
  'rover.noRecharge': 'No panels and no RTG: the battery is all it has, and it does not recharge.',
  'rover.source': 'Source',
  'rover.mission': 'Mission',
  'rover.year': 'Year of the trip',
  'rover.days': 'Days on the Moon',
  'rover.daysNote': 'These are days of 24 hours, not lunar days.',
  'rover.dte': 'Needs to see the Earth (DTE)',
  'rover.dteHint': 'On: a direct link to the Earth. Off: a relay satellite carries the link, so the Earth need not be in view.',
  'rover.window': 'Window: from {start}, {days} days.',
  'rover.windowOut': 'This Window is outside what the engine covers ({min} to {max}, up to {max_days} days).',
  'rover.height': 'The {name} mast is {height} m high, a natural Observer height for it.',
  'rover.useHeight': 'Use {height} m as the Observer height',
  'rover.fitRtg': 'The RTG covers the load, so the longest night of this Window (LCSP), {lcsp}, does not drain the {name}.',
  'rover.fitNoNight': 'The Sun does not set in this Window, so there is no night for the {name} to get through.',
  'rover.fitFits':
    'The longest night of this Window (LCSP) lasts {lcsp}. The {name} lasts {tolerance} in the dark, so it gets through with {margin} to spare.',
  'rover.fitShort':
    'The longest night of this Window (LCSP) lasts {lcsp}. The {name} lasts {tolerance} in the dark, so its battery runs out {gap} before the Sun comes back.',
  'rover.fitBadgeFits': 'Gets through the night',
  'rover.fitBadgeShort': 'Does not get through',
  'rover.fitBadgeRtg': 'Not limited by the night',
  'rover.fitNote':
    'Mission fit is a plain comparison of the Darkness tolerance with the LCSP. It assumes a full battery when the night starts and a load that does not change, and it has no thermal model.',
}

export type RoverKey = keyof typeof en

export const pt: Record<RoverKey, string> = {
  'rover.title': 'Qual rover, e por quantos dias?',
  'rover.intro':
    'Escolha um rover e uma missão. O mastro do rover sugere uma Altura do Observador, e a Tolerância à escuridão dele é comparada com a maior noite (LCSP) da Janela.',
  'rover.groups': 'Para onde o rover foi construído',
  'rover.moon': 'Lua',
  'rover.mars': 'Marte',
  'rover.marsLabel': 'E se fosse à Lua?',
  'rover.marsNote': 'Construído para Marte. Os números são os do próprio rover; a pergunta é o que aconteceria se ele fosse à Lua.',
  'rover.list': 'Rovers',
  'rover.prev': 'Rover anterior',
  'rover.next': 'Próximo rover',
  'rover.loading': 'Carregando os rovers…',
  'rover.error': 'Não foi possível carregar os rovers.',
  'rover.retry': 'Tentar de novo',
  'rover.empty': 'Não há rovers para mostrar.',
  'rover.cardDark': '{hours} h no escuro',
  'rover.cardRtg': 'RTG, sem limite no escuro',
  'rover.mass': 'Massa',
  'rover.battery': 'Bateria',
  'rover.panels': 'Painéis solares',
  'rover.rtg': 'RTG (nuclear)',
  'rover.shadow': 'Consumo na sombra',
  'rover.mast': 'Mastro',
  'rover.slope': 'Limite de declive',
  'rover.dark': 'Tolerância à escuridão',
  'rover.none': 'nenhum',
  'rover.noLimit': 'sem limite',
  'rover.unitKg': 'kg',
  'rover.unitWh': 'Wh',
  'rover.unitW': 'W',
  'rover.unitM': 'm',
  'rover.unitDeg': '°',
  'rover.unitH': 'h',
  'rover.estimatedTitle': 'Estimado: a fonte não dá este número.',
  'rover.estimatedLegend': '* estimado, porque a fonte não o dá',
  'rover.rtgCovers': 'O RTG cobre o consumo, então o escuro não descarrega a bateria.',
  'rover.noRecharge': 'Sem painéis e sem RTG: a bateria é tudo o que ele tem, e não recarrega.',
  'rover.source': 'Fonte',
  'rover.mission': 'Missão',
  'rover.year': 'Ano da viagem',
  'rover.days': 'Dias na Lua',
  'rover.daysNote': 'São dias de 24 horas, não dias lunares.',
  'rover.dte': 'Precisa ver a Terra (DTE)',
  'rover.dteHint': 'Ligado: link direto com a Terra. Desligado: um satélite de retransmissão leva o link, então a Terra não precisa estar à vista.',
  'rover.window': 'Janela: a partir de {start}, {days} dias.',
  'rover.windowOut': 'Esta Janela está fora do que o motor cobre ({min} a {max}, até {max_days} dias).',
  'rover.height': 'O mastro do {name} tem {height} m, uma Altura do Observador natural para ele.',
  'rover.useHeight': 'Usar {height} m como Altura do Observador',
  'rover.fitRtg': 'O RTG cobre o consumo, então a maior noite desta Janela (LCSP), {lcsp}, não descarrega o {name}.',
  'rover.fitNoNight': 'O Sol não se põe nesta Janela, então não há noite para o {name} atravessar.',
  'rover.fitFits':
    'A maior noite desta Janela (LCSP) dura {lcsp}. O {name} aguenta {tolerance} no escuro, então atravessa e ainda sobram {margin}.',
  'rover.fitShort':
    'A maior noite desta Janela (LCSP) dura {lcsp}. O {name} aguenta {tolerance} no escuro, então a bateria acaba {gap} antes de o Sol voltar.',
  'rover.fitBadgeFits': 'Atravessa a noite',
  'rover.fitBadgeShort': 'Não atravessa',
  'rover.fitBadgeRtg': 'A noite não o limita',
  'rover.fitNote':
    'O encaixe da missão é uma comparação simples da Tolerância à escuridão com a LCSP. Supõe a bateria cheia no começo da noite e um consumo que não muda, e não tem modelo térmico.',
}

const CATALOGUES: Record<Locale, Record<RoverKey, string>> = { en, pt }

/** One sentence or label in `locale`, with its `{values}` filled in. */
export function roverText(locale: Locale, key: RoverKey, params?: Record<string, string>): string {
  return CATALOGUES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)
}
