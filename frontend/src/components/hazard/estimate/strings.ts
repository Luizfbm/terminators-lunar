// The words that say a hazard figure is our group's estimate, what it is based on and the error it may
// carry, in English and Portuguese. Plain sentences in the voice of the screens around them. No person is
// named: the figures are "our group's" (Luiz, 15/11/2026). Glossary terms as written in GLOSSARY.md:
// Site, False alarm, Unvetoed hazard, Shield, Confidence level, Navegação Normal and Multirresolução.
import type { EstimateLocale } from './estimate'

export const en = {
  'estimate.label': 'Our group’s estimate',
  'estimate.range': 'from {low} to {high}',
  'estimate.rangeSame': 'about {value}',

  // The seal over the view from the ground: short.
  'estimate.seal':
    'Our group’s estimate, from the cells the laser measured. It may contain errors: at the same false alarm the change is {range}, not {change}.',
  'estimate.sealNoChange':
    'Our group’s estimate, from the cells the laser measured. It may contain errors: at the same false alarm the change is {range}.',
  'estimate.sealNoRange':
    'Our group’s estimate, from the cells the laser measured. It may contain errors, and this grid has no same-false-alarm curve to give their range.',

  // The inspector and the Plan A x Plan B block: longer.
  'estimate.lead':
    'Our group estimated, based on {cells} cells the laser measured (each hidden from the method and then used to test it), that Multiresolution {level} changes the unvetoed hazard by {change} against Normal navigation.',
  'estimate.leadNoChange':
    'Our group estimated, based on {cells} cells the laser measured (each hidden from the method and then used to test it), the unvetoed hazard of both navigations. Normal navigation leaves {normal}, so there is no change to give.',
  'estimate.rangeDetail':
    'It may contain errors, and the possible error is the false alarm: the two navigations block different shares of the safe ground ({normalFa} against {multiFa}), and at the same false alarm, between {fromFa} and {toFa}, the change is {range}.',
  'estimate.rangeNone': 'It may contain errors. This grid has no same-false-alarm curve, so we cannot give a range for them.',
  'estimate.gains':
    'Across our group’s 26 grids, Multiresolution’s own gain at the same false alarm was {median} in the median, and {median20} when the coarse grid is 20 m.',

  'estimate.shield':
    'The Shield, the margin on every cell, is 1° plus z times {near}° near laser shots or {far}° far from them. {level} is the z we used, a label and not a promise: here the margin really covered {coverage} of the checked cells.',
  'estimate.shieldCheck':
    'Only the {far}° branch was checked against a separate terrain model (SfS), in {regions} regions: {level} was exceeded {low} to {high} of the time, against {promised} promised. The {near}° branch has no check, and the figures may contain errors.',
  'estimate.shieldNoCheck':
    'Only the {far}° branch was checked against a separate terrain model (SfS), in {regions} regions. The {near}° branch has no check, and the figures may contain errors.',
}

export type EstimateKey = keyof typeof en

export const pt: Record<EstimateKey, string> = {
  'estimate.label': 'Estimativa do nosso grupo',
  'estimate.range': 'de {low} a {high}',
  'estimate.rangeSame': 'cerca de {value}',

  'estimate.seal':
    'Estimativa do nosso grupo, a partir das células que o laser mediu. Pode conter erros: com o mesmo falso alarme a variação é {range}, não {change}.',
  'estimate.sealNoChange':
    'Estimativa do nosso grupo, a partir das células que o laser mediu. Pode conter erros: com o mesmo falso alarme a variação é {range}.',
  'estimate.sealNoRange':
    'Estimativa do nosso grupo, a partir das células que o laser mediu. Pode conter erros, e esta grade não tem curva de mesmo falso alarme para dar a faixa deles.',

  'estimate.lead':
    'Nosso grupo estimou, com base em {cells} células que o laser mediu (cada uma escondida do método e depois usada para testá-lo), que a Multirresolução {level} muda o perigo não vetado em {change} em relação à Navegação Normal.',
  'estimate.leadNoChange':
    'Nosso grupo estimou, com base em {cells} células que o laser mediu (cada uma escondida do método e depois usada para testá-lo), o perigo não vetado das duas navegações. A Navegação Normal deixa {normal}, então não há variação para dar.',
  'estimate.rangeDetail':
    'Pode conter erros, e o erro possível está no falso alarme: as duas navegações bloqueiam partes diferentes do terreno seguro ({normalFa} contra {multiFa}), e com o mesmo falso alarme, entre {fromFa} e {toFa}, a variação é {range}.',
  'estimate.rangeNone': 'Pode conter erros. Esta grade não tem curva de mesmo falso alarme, então não dá para dar uma faixa deles.',
  'estimate.gains':
    'Nas 26 grades do nosso grupo, o ganho próprio da Multirresolução com o mesmo falso alarme foi de {median} na mediana, e de {median20} quando a grade grossa é de 20 m.',

  'estimate.shield':
    'O Escudo, a margem de cada célula, é 1° mais z vezes {near}° perto de disparos do laser ou {far}° longe deles. {level} é o z que usamos, um rótulo e não uma promessa: aqui a margem cobriu de fato {coverage} das células conferidas.',
  'estimate.shieldCheck':
    'Só o ramo de {far}° foi conferido contra um modelo de terreno à parte (SfS), em {regions} regiões: o {level} foi excedido de {low} a {high} das vezes, contra {promised} prometidos. O ramo de {near}° não tem conferência, e os números podem conter erros.',
  'estimate.shieldNoCheck':
    'Só o ramo de {far}° foi conferido contra um modelo de terreno à parte (SfS), em {regions} regiões. O ramo de {near}° não tem conferência, e os números podem conter erros.',
}

const CATALOGUES: Record<EstimateLocale, Record<EstimateKey, string>> = { en, pt }

/** One sentence in `locale`, `{slots}` filled; a slot with no value stays as written. */
export function estimateText(locale: EstimateLocale, key: EstimateKey, params?: Record<string, string>): string {
  return CATALOGUES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)
}
