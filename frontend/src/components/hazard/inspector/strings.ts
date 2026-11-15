// The 10 x 10 km inspector (issue #95), in English and Portuguese. Glossary: Site, Confidence level.
// Only two variants exist on screen: Normal navigation and Multiresolution. The numbers belong to the
// grid, never to the Site's own point, and the screen says so.
// Plain data, like the other panels'. `text` reads it by locale, so the inspector needs no change to
// src/i18n/messages.ts; whoever mounts it may also spread `en` and `pt` into the catalogues.

export const en = {
  'hazard.title': 'Local inspector, 10 × 10 km',
  'hazard.close': 'Close',
  'hazard.ownership':
    'These numbers belong to grid {grid}, whose centre is {distance} km from the Site. They are not the Site’s own point.',
  'hazard.inside': 'The Site falls inside this grid. The ⊕ marks it.',
  'hazard.outside': 'The Site falls outside this grid, so there is no ⊕ on the map.',
  'hazard.normal': 'Normal navigation',
  'hazard.multi': 'Multiresolution',
  'hazard.normalHint': 'Reads only the coarse grid, with no margin.',
  'hazard.multiHint': 'Adds the 5 m detail where the laser really measured, and a margin per cell at the Confidence level.',
  'hazard.coarseLabel': 'Coarse grid',
  'hazard.coarseOption': '{m} m grid',
  'hazard.levelLabel': 'Confidence level',
  'hazard.curtainLabel': 'Compare',
  'hazard.curtainHelp': 'Drag the line, or use the arrow keys on the slider, to move between Normal navigation on the left and Multiresolution on the right.',
  'hazard.falseAlarmLabel': 'False alarm',
  'hazard.falseAlarmHelp': 'The share of safe ground each navigation blocks. Holding both to the same value is the fair way to compare them.',
  'hazard.paneNormal': 'Normal navigation · {m} m grid',
  'hazard.paneMulti': 'Multiresolution · 5 m + LDEC · {level}',
  'hazard.legendCoarse': 'Steeper than {limit}° on the coarse grid',
  'hazard.legendHidden': 'Steeper than {limit}° at 5 m, hidden by the coarse grid',
  'hazard.legendSeen': 'Steeper than {limit}° at 5 m, also seen by the coarse grid',
  'hazard.legendLdec': 'Real laser shots (LDEC), bluer where there are more',
  'hazard.legendSite': 'Site',
  'hazard.scale': '2 km',
  'hazard.mapNote': 'The map shows the 5 m slope as measured. The Confidence level changes the numbers below, not the map.',
  'hazard.alt': 'Shaded relief of the 10 × 10 km grid {grid}: Normal navigation on the left of the line and Multiresolution on the right.',
  'hazard.fairTitle': 'At the same false alarm of {fa}',
  'hazard.fairNormal': 'Unvetoed hazard, Normal navigation',
  'hazard.fairMulti': 'Unvetoed hazard, Multiresolution',
  'hazard.fairReduction': 'Reduction',
  'hazard.fairMedian': 'Median slope error, Normal navigation → Multiresolution',
  'hazard.sentenceLess':
    'With {fa} of the safe ground blocked, Normal navigation leaves {normal} of the steep ground unvetoed and Multiresolution {multi}: {pct} less.',
  'hazard.sentenceSame':
    'With {fa} of the safe ground blocked, Normal navigation and Multiresolution leave the same share of the steep ground unvetoed: {normal}.',
  'hazard.sentenceMore':
    'With {fa} of the safe ground blocked, Normal navigation leaves {normal} of the steep ground unvetoed and Multiresolution {multi}: {pct} more.',
  'hazard.noCurve': 'The curve has no point at this false alarm, and we do not extend it.',
  'hazard.noReduction': 'Normal navigation leaves no unvetoed hazard here, so there is nothing to reduce.',
  'hazard.nominalTitle': 'Each navigation as it runs',
  'hazard.nominalNote':
    'At {level}, Multiresolution blocks more safe ground than Normal navigation does, so these two are not a fair comparison. The numbers above are.',
  'hazard.nominalRow': '{navigation}: unvetoed hazard {missed}, false alarm {falseAlarm}',
  'hazard.interval': '{mean} (95% interval {low} to {high})',
  'hazard.terrainTitle': 'The ground in this grid',
  'hazard.terrainSteep5': 'Steeper than {limit}° at 5 m',
  'hazard.terrainSteepCoarse': 'Steeper than {limit}° on the {m} m grid',
  'hazard.terrainMeasured': 'Share of 5 m cells with a real laser shot',
  'hazard.lroc': 'LROC NAC images over the grid: {count}, best {resolution} m per pixel.',
  'hazard.lrocNone': 'No LROC NAC image covers this grid.',
  'hazard.lrocLink': 'Open the best image',
  'hazard.source': 'Source: {source}',
  'hazard.loading': 'Loading the 10 × 10 km grid…',
  'hazard.noGrid': 'No 5 m grid lies within 15 km of this Site, so there is nothing to inspect.',
  'hazard.errorTitle': 'The inspector could not load.',
  'hazard.error.network': 'The server did not answer. Check the connection and try again.',
  'hazard.error.no_hazard_grid': 'No 5 m grid lies within 15 km of this Site.',
  'hazard.error.decode': 'The grid came back in a form this page does not read.',
  'hazard.error.unknown': 'Something went wrong on the server. Try again in a moment.',
  'hazard.retry': 'Try again',
} as const

export type HazardKey = keyof typeof en

export const pt: Record<HazardKey, string> = {
  'hazard.title': 'Inspetor local, 10 × 10 km',
  'hazard.close': 'Fechar',
  'hazard.ownership':
    'Estes números são da grade {grid}, cujo centro está a {distance} km do Local. Não são do ponto do próprio Local.',
  'hazard.inside': 'O Local está dentro desta grade. O ⊕ marca onde.',
  'hazard.outside': 'O Local está fora desta grade, por isso não há ⊕ no mapa.',
  'hazard.normal': 'Navegação Normal',
  'hazard.multi': 'Multirresolução',
  'hazard.normalHint': 'Lê só a grade grossa, sem margem.',
  'hazard.multiHint': 'Soma o detalhe de 5 m onde o laser mediu de verdade e uma margem por célula no Nível de confiança.',
  'hazard.coarseLabel': 'Grade grossa',
  'hazard.coarseOption': 'Grade de {m} m',
  'hazard.levelLabel': 'Nível de confiança',
  'hazard.curtainLabel': 'Comparar',
  'hazard.curtainHelp': 'Arraste a linha, ou use as setas no controle, para ir da Navegação Normal, à esquerda, à Multirresolução, à direita.',
  'hazard.falseAlarmLabel': 'Falso alarme',
  'hazard.falseAlarmHelp': 'A parte do terreno seguro que cada navegação bloqueia. Fixar os dois no mesmo valor é a forma justa de compará-las.',
  'hazard.paneNormal': 'Navegação Normal · grade de {m} m',
  'hazard.paneMulti': 'Multirresolução · 5 m + LDEC · {level}',
  'hazard.legendCoarse': 'Mais inclinado que {limit}° na grade grossa',
  'hazard.legendHidden': 'Mais inclinado que {limit}° a 5 m, escondido pela grade grossa',
  'hazard.legendSeen': 'Mais inclinado que {limit}° a 5 m, também visto pela grade grossa',
  'hazard.legendLdec': 'Disparos reais do laser (LDEC), mais azul onde há mais',
  'hazard.legendSite': 'Local',
  'hazard.scale': '2 km',
  'hazard.mapNote': 'O mapa mostra a inclinação de 5 m como foi medida. O Nível de confiança muda os números abaixo, não o mapa.',
  'hazard.alt': 'Relevo sombreado da grade {grid} de 10 × 10 km: Navegação Normal à esquerda da linha e Multirresolução à direita.',
  'hazard.fairTitle': 'Com o mesmo falso alarme de {fa}',
  'hazard.fairNormal': 'Perigo não vetado, Navegação Normal',
  'hazard.fairMulti': 'Perigo não vetado, Multirresolução',
  'hazard.fairReduction': 'Redução',
  'hazard.fairMedian': 'Erro mediano da inclinação, Navegação Normal → Multirresolução',
  'hazard.sentenceLess':
    'Com {fa} do terreno seguro bloqueado, a Navegação Normal deixa {normal} do terreno íngreme sem veto e a Multirresolução {multi}: {pct} a menos.',
  'hazard.sentenceSame':
    'Com {fa} do terreno seguro bloqueado, a Navegação Normal e a Multirresolução deixam a mesma parte do terreno íngreme sem veto: {normal}.',
  'hazard.sentenceMore':
    'Com {fa} do terreno seguro bloqueado, a Navegação Normal deixa {normal} do terreno íngreme sem veto e a Multirresolução {multi}: {pct} a mais.',
  'hazard.noCurve': 'A curva não tem ponto neste falso alarme, e nós não a estendemos.',
  'hazard.noReduction': 'A Navegação Normal não deixa perigo sem veto aqui, então não há o que reduzir.',
  'hazard.nominalTitle': 'Cada navegação como ela roda',
  'hazard.nominalNote':
    'No {level}, a Multirresolução bloqueia mais terreno seguro que a Navegação Normal, então estas duas não são uma comparação justa. Os números acima são.',
  'hazard.nominalRow': '{navigation}: perigo não vetado {missed}, falso alarme {falseAlarm}',
  'hazard.interval': '{mean} (intervalo de 95% de {low} a {high})',
  'hazard.terrainTitle': 'O terreno desta grade',
  'hazard.terrainSteep5': 'Mais inclinado que {limit}° a 5 m',
  'hazard.terrainSteepCoarse': 'Mais inclinado que {limit}° na grade de {m} m',
  'hazard.terrainMeasured': 'Parte das células de 5 m com um disparo real do laser',
  'hazard.lroc': 'Imagens LROC NAC sobre a grade: {count}, a melhor com {resolution} m por pixel.',
  'hazard.lrocNone': 'Nenhuma imagem LROC NAC cobre esta grade.',
  'hazard.lrocLink': 'Abrir a melhor imagem',
  'hazard.source': 'Fonte: {source}',
  'hazard.loading': 'Carregando a grade de 10 × 10 km…',
  'hazard.noGrid': 'Nenhuma grade de 5 m fica a menos de 15 km deste Local, então não há o que inspecionar.',
  'hazard.errorTitle': 'Não deu para carregar o inspetor.',
  'hazard.error.network': 'O servidor não respondeu. Confira a conexão e tente de novo.',
  'hazard.error.no_hazard_grid': 'Nenhuma grade de 5 m fica a menos de 15 km deste Local.',
  'hazard.error.decode': 'A grade veio num formato que esta página não lê.',
  'hazard.error.unknown': 'Algo deu errado no servidor. Tente de novo daqui a pouco.',
  'hazard.retry': 'Tentar de novo',
}

export type InspectorLocale = 'en' | 'pt'

const CATALOGUES: Record<InspectorLocale, Record<HazardKey, string>> = { en, pt }

/** Fills `{name}` placeholders; one with no value is left as written. */
export function fill(template: string, params?: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)
}

export function text(locale: InspectorLocale, key: HazardKey, params?: Record<string, string>): string {
  return fill(CATALOGUES[locale][key], params)
}

/** The message for a problem code the API (or the transport) sent. */
export function errorKey(code: string): HazardKey {
  if (code === 'network') return 'hazard.error.network'
  if (code === 'no_hazard_grid') return 'hazard.error.no_hazard_grid'
  if (code === 'decode') return 'hazard.error.decode'
  return 'hazard.error.unknown'
}
