// Every string of the side-by-side drive panel, in English and Portuguese. Only two plans exist and
// they go by these names everywhere: "Normal navigation" and "Multiresolution" (PT: "Navegação
// Normal" and "Multirresolução"). The panel's own catalogue travels with the component; the language
// is the app's (`useI18n().locale`).
import type { Locale } from '../../../i18n/messages'

export const en = {
  title: 'Normal navigation × Multiresolution',
  intro: 'The same drive across the ground around the Site, planned twice. Click the plan you want to accept.',
  'nav.normal': 'Normal navigation',
  'nav.multiresolution': 'Multiresolution',
  'reads.normal': 'Reads only the {grid} m grid, with no margin.',
  'reads.multiresolution': 'Reads the 5 m ground and where the laser measured it, with a margin at {level}.',
  'accept.hint': 'Click a panel to accept that plan.',
  'accept.label': 'Accept {plan}',
  accepted: 'Accepted',
  'accepted.line': 'Accepted: {plan}.',
  close: 'Close',

  'rover.line': 'Rover: {rover}. Slope limit {limit}°. Sun fraction {sun}.',
  'rover.custom': 'custom numbers',

  'layer.label': 'Ground grid (LOLA)',
  'layer.option': '{grid} m',
  'layer.note': 'Each square is 50 m of ground. Its slope is read at the chosen resolution, and red is steeper than {limit}°.',
  'layer.note5': 'At 5 m you see the ground the Rover really crosses; Normal navigation still planned on the {grid} m grid.',
  'legend.hazard': 'Steeper than the limit',
  'legend.measured': 'Lighter ground: a laser shot measured it',
  'legend.path.normal': 'Path of Normal navigation',
  'legend.path.multiresolution': 'Path of Multiresolution',
  'legend.cross': '× a hazard crossed, or an agent that fell',
  'legend.veto': '○ a veto of the shield',
  'legend.sun': '◆ a spot facing the Sun, for the animation only',
  scrub: 'Position in the drive',

  play: 'Play',
  pause: 'Pause',
  replay: 'Replay',
  speed: 'Speed',
  'speed.option': '{value}×',

  'swarm.running': 'Generation {generation} of {generations}. {total} agents, {fallen} fallen so far.',
  'swarm.settled': 'Generation {generation} of {generations}. {survivors} of {total} agents survived.',
  'swarm.note': 'The swarm is an illustration of the search, not a result. Its survivors are not evidence for either plan.',

  'pane.so_far': 'So far: {distance}, {hazards} hazards, battery {battery}.',
  'pane.canvas': '{plan}: the planned path over the ground, {distance} long, {hazards} hazards crossed.',

  'footer.caption': 'The two plans, number by number',
  'footer.number': 'Number',
  'row.reached': 'Reaches the goal',
  'row.distance': 'Distance',
  'row.time': 'Time',
  'row.hazards': 'Hazards crossed',
  'row.vetoes': 'Vetoes of the shield',
  'row.battery': 'Lowest battery',
  yes: 'yes',
  no: 'no',
  'hazard.note': 'A hazard is a waypoint on ground steeper than the Rover’s slope limit when read at 5 m.',
  'avoided.none': 'Multiresolution crosses no fewer hazards than Normal navigation: {multi} against {normal}.',
  'avoided.one': 'Multiresolution crosses 1 hazard fewer than Normal navigation: {multi} against {normal}.',
  'avoided.many': 'Multiresolution crosses {count} hazards fewer than Normal navigation: {multi} against {normal}.',

  'assumptions.line': 'The planner’s costs, its speed and the battery model are assumptions, not measurements and not values from a paper.',
  'assumptions.summary': 'Show the {count} numbers assumed',
  'assumptions.note': 'A different choice for any of them would draw different paths. The costs are in the planner’s own units.',
  'assumption.speed_m_s': 'Driving speed (m/s)',
  'assumption.waypoint_step_m': 'Spacing of the waypoints (m)',
  'assumption.solar_efficiency': 'Share of the solar power the battery model counts',
  'assumption.slope_power_per_deg_above_5': 'Extra power drawn per degree of slope above 5°',
  'assumption.normal_cost_over_limit': 'Normal navigation: cost of a cell over the limit',
  'assumption.normal_cost_per_deg_over_limit': 'Normal navigation: extra cost per degree over the limit',
  'assumption.normal_cost_per_deg': 'Normal navigation: cost per degree of slope',
  'assumption.multi_cost_over_limit_5m': 'Multiresolution: cost of a cell over the limit at 5 m',
  'assumption.multi_cost_per_deg_over_limit_5m': 'Multiresolution: extra cost per degree over the limit at 5 m',
  'assumption.multi_cost_margin_over_limit': 'Multiresolution: cost of a cell that is over the limit only once the margin is added',
  'assumption.multi_cost_per_deg_margin_over_limit': 'Multiresolution: extra cost per degree over the limit with the margin',
  'assumption.multi_cost_per_deg': 'Multiresolution: cost per degree of slope',
  'assumption.multi_cost_low_density': 'Multiresolution: extra cost where laser shots are scarce',
  'assumption.margin_weight': 'Weight of the margin in the slope the shield reads',
  'assumption.heuristic_weight': 'Weight of the straight-line distance in the search',
  'assumption.veto_lookahead_m': 'How far ahead the shield looks to veto (m)',
  'assumption.reached_within_m': 'Distance from the goal that counts as reached (m)',

  loading: 'Planning the drive on the ground around the Site. This can take a few seconds…',
  'error.title': 'The drive could not be planned.',
  'error.no_hazard_grid': 'No 5 m ground grid lies within 15 km of this Site, so there is nothing to plan on.',
  'error.invalid_parameter': 'The start or the goal is outside the ground grid.',
  'error.network': 'The server could not be reached.',
  'error.busy': 'The server is busy working out other answers. Try again in a few seconds.',
  'error.unknown': 'Something went wrong on the server.',
  'error.grid': 'The ground grid came back in a shape this panel cannot read.',
  retry: 'Try again',
} as const

export type CompareKey = keyof typeof en

export const pt: Record<CompareKey, string> = {
  title: 'Navegação Normal × Multirresolução',
  intro: 'O mesmo trajeto pelo chão em volta do Local, planejado duas vezes. Clique no plano que você quer aceitar.',
  'nav.normal': 'Navegação Normal',
  'nav.multiresolution': 'Multirresolução',
  'reads.normal': 'Lê só a grade de {grid} m, sem margem.',
  'reads.multiresolution': 'Lê o chão a 5 m e onde o laser mediu, com margem no {level}.',
  'accept.hint': 'Clique num quadro para aceitar aquele plano.',
  'accept.label': 'Aceitar {plan}',
  accepted: 'Aceito',
  'accepted.line': 'Aceito: {plan}.',
  close: 'Fechar',

  'rover.line': 'Rover: {rover}. Limite de inclinação {limit}°. Fração do Sol {sun}.',
  'rover.custom': 'números próprios',

  'layer.label': 'Grade do chão (LOLA)',
  'layer.option': '{grid} m',
  'layer.note': 'Cada quadrado é 50 m de chão. A inclinação é lida na resolução escolhida, e o vermelho é mais íngreme que {limit}°.',
  'layer.note5': 'A 5 m você vê o chão que o Rover realmente atravessa; a Navegação Normal ainda planejou na grade de {grid} m.',
  'legend.hazard': 'Mais íngreme que o limite',
  'legend.measured': 'Chão mais claro: um tiro de laser mediu',
  'legend.path.normal': 'Caminho da Navegação Normal',
  'legend.path.multiresolution': 'Caminho da Multirresolução',
  'legend.cross': '× um perigo atravessado, ou um agente que caiu',
  'legend.veto': '○ um veto do escudo',
  'legend.sun': '◆ um ponto virado para o Sol, só para a animação',
  scrub: 'Posição no trajeto',

  play: 'Tocar',
  pause: 'Pausar',
  replay: 'Repetir',
  speed: 'Velocidade',
  'speed.option': '{value}×',

  'swarm.running': 'Geração {generation} de {generations}. {total} agentes, {fallen} caíram até agora.',
  'swarm.settled': 'Geração {generation} de {generations}. {survivors} de {total} agentes sobreviveram.',
  'swarm.note': 'O enxame é uma ilustração da busca, não é resultado. Os sobreviventes dele não são evidência a favor de nenhum dos planos.',

  'pane.so_far': 'Até aqui: {distance}, {hazards} perigos, bateria {battery}.',
  'pane.canvas': '{plan}: o caminho planejado sobre o chão, com {distance}, {hazards} perigos atravessados.',

  'footer.caption': 'Os dois planos, número por número',
  'footer.number': 'Número',
  'row.reached': 'Chega ao destino',
  'row.distance': 'Distância',
  'row.time': 'Tempo',
  'row.hazards': 'Perigos atravessados',
  'row.vetoes': 'Vetos do escudo',
  'row.battery': 'Menor bateria',
  yes: 'sim',
  no: 'não',
  'hazard.note': 'Um perigo é um ponto do caminho em chão mais íngreme que o limite de inclinação do Rover, lido a 5 m.',
  'avoided.none': 'A Multirresolução não atravessa menos perigos que a Navegação Normal: {multi} contra {normal}.',
  'avoided.one': 'A Multirresolução atravessa 1 perigo a menos que a Navegação Normal: {multi} contra {normal}.',
  'avoided.many': 'A Multirresolução atravessa {count} perigos a menos que a Navegação Normal: {multi} contra {normal}.',

  'assumptions.line': 'Os custos do planejador, a velocidade e o modelo de bateria são suposições, não medidas nem valores de um artigo.',
  'assumptions.summary': 'Mostrar os {count} números supostos',
  'assumptions.note': 'Outra escolha para qualquer um deles desenharia outros caminhos. Os custos estão nas unidades do próprio planejador.',
  'assumption.speed_m_s': 'Velocidade de rodagem (m/s)',
  'assumption.waypoint_step_m': 'Espaçamento dos pontos do caminho (m)',
  'assumption.solar_efficiency': 'Parte da potência solar que o modelo de bateria conta',
  'assumption.slope_power_per_deg_above_5': 'Potência extra gasta por grau de inclinação acima de 5°',
  'assumption.normal_cost_over_limit': 'Navegação Normal: custo de uma célula acima do limite',
  'assumption.normal_cost_per_deg_over_limit': 'Navegação Normal: custo extra por grau acima do limite',
  'assumption.normal_cost_per_deg': 'Navegação Normal: custo por grau de inclinação',
  'assumption.multi_cost_over_limit_5m': 'Multirresolução: custo de uma célula acima do limite a 5 m',
  'assumption.multi_cost_per_deg_over_limit_5m': 'Multirresolução: custo extra por grau acima do limite a 5 m',
  'assumption.multi_cost_margin_over_limit': 'Multirresolução: custo de uma célula que só passa do limite com a margem somada',
  'assumption.multi_cost_per_deg_margin_over_limit': 'Multirresolução: custo extra por grau acima do limite com a margem',
  'assumption.multi_cost_per_deg': 'Multirresolução: custo por grau de inclinação',
  'assumption.multi_cost_low_density': 'Multirresolução: custo extra onde há poucos tiros de laser',
  'assumption.margin_weight': 'Peso da margem na inclinação que o escudo lê',
  'assumption.heuristic_weight': 'Peso da distância em linha reta na busca',
  'assumption.veto_lookahead_m': 'Até onde o escudo olha à frente para vetar (m)',
  'assumption.reached_within_m': 'Distância do destino que conta como chegada (m)',

  loading: 'Planejando o trajeto no chão em volta do Local. Isso pode levar alguns segundos…',
  'error.title': 'Não deu para planejar o trajeto.',
  'error.no_hazard_grid': 'Nenhuma grade de chão a 5 m fica a menos de 15 km deste Local, então não há onde planejar.',
  'error.invalid_parameter': 'O início ou o destino está fora da grade do chão.',
  'error.network': 'Não foi possível falar com o servidor.',
  'error.busy': 'O servidor está ocupado com outras respostas. Tente de novo em alguns segundos.',
  'error.unknown': 'Algo deu errado no servidor.',
  'error.grid': 'A grade do chão veio num formato que este painel não consegue ler.',
  retry: 'Tentar de novo',
}

export interface Text {
  t: (key: CompareKey, params?: Record<string, string>) => string
  /** The label of one of the planner's assumed numbers, or its own name when the API sends one this panel does not know. */
  assumption: (name: string) => string
}

const CATALOGUES: Record<Locale, Record<CompareKey, string>> = { en, pt }

export function textFor(locale: Locale): Text {
  const catalogue = CATALOGUES[locale]
  return {
    t: (key, params) => catalogue[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match),
    assumption: (name) => catalogue[`assumption.${name}` as CompareKey] ?? name,
  }
}
