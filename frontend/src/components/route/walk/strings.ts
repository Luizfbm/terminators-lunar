// "Walk the surface": the 3D walk over the hazard grid, in both languages. Glossary terms as written
// in GLOSSARY.md. Only two ways to navigate are named: Normal navigation and Multiresolution.
// Plain data; `walkText` picks a language without needing the app's catalogue.

export const en = {
  'walk.title': 'Walk the surface',
  'walk.intro':
    'The ground is the hazard grid the server returns, in 50 m blocks. Nothing is added to it: no extra craters and no rocks.',
  'walk.plan': 'Plan',
  'walk.plan.normal': 'Normal navigation',
  'walk.plan.multiresolution': 'Multiresolution',
  'walk.mode': 'Drive',
  'walk.mode.manual': 'Manual',
  'walk.mode.auto': 'Autonomous',
  'walk.start': 'Start',
  'walk.pause': 'Pause',
  'walk.reset': 'Back to start',
  'walk.sun': '☀️ Face the Sun',
  'walk.sun.label': 'Face the Sun (F)',
  'walk.sun.none': 'There is no Sun azimuth for this view.',
  'walk.view.rover': 'Follow the rover',
  'walk.view.top': 'View from above',
  'walk.keys':
    'Click the view, then drive with W A S D or the arrow keys and press F to face the Sun. Any key takes over from the autonomous drive.',
  'walk.pad.forward': 'Forward',
  'walk.pad.back': 'Back',
  'walk.pad.left': 'Turn left',
  'walk.pad.right': 'Turn right',
  'walk.t.heading': 'Heading',
  'walk.t.distance': 'Distance',
  'walk.t.height': 'Height',
  'walk.t.slope': 'Slope at 5 m',
  'walk.t.battery': 'Battery on the plan',
  'walk.t.steep': 'Steep ground entered',
  'walk.t.rays': 'Rays',
  'walk.battery.off': 'away from the plan',
  'walk.battery.note':
    'The battery is the plan’s own figure at the waypoint nearest the rover, of {wh} Wh. The walk does not draw it down.',
  'walk.rays.none': 'No rays: this route was asked for without the Sun’s azimuth.',
  'walk.rays.note': 'The yellow rays are an illustration. They give no energy, and the battery does not change when you pick one up.',
  'walk.light.note':
    'The light comes from the Sun’s direction at the Cursor and only shades the slopes. It casts no shadows here, so the Sun fraction is not drawn.',
  'walk.pace.note': 'The walk is played far faster than the rover drives. The plan’s own drive takes {hours} h.',
  'walk.estimate':
    'Our group estimated, from the planner’s assumed costs and speed and the 5 m slope of the ground, that this plan covers {distance} m in {hours} h and enters {hazards} steep waypoints. It may contain errors. The plan is scored on the same 5 m slope it planned with, and we have no measured range for it.',
  'walk.summary': '{distance} m · {hours} h · {hazards} steep waypoints · {reached}',
  'walk.reached.yes': 'reaches the goal',
  'walk.reached.no': 'does not reach the goal',
  'walk.arrived': 'The rover reached the end of the plan.',
  'walk.legend.steep': 'Steeper than the Rover’s limit at 5 m',
  'walk.legend.measured': 'Measured by the laser',
  'walk.legend.normal': 'Normal navigation route',
  'walk.legend.multiresolution': 'Multiresolution route',
  'walk.legend.rays': 'Rays (illustration)',
  'walk.legend.goal': 'Goal',
  'walk.legend.rover': 'Rover',
  'walk.loading': 'Loading the ground…',
  'walk.retry': 'Try again',
  'walk.error.title': 'Could not load the ground',
  'walk.error.network': 'The server did not answer. Check the connection, then try again.',
  'walk.error.busy': 'The server is busy right now. Try again in a few seconds.',
  'walk.error.no_hazard_grid': 'No ground grid lies within 15 km of this Site.',
  'walk.error.missing_site': 'This Site does not exist.',
  'walk.error.unknown': 'Something went wrong while loading the ground.',
  'walk.flat': '3D is not available in this browser, so the walk runs on the flat map.',
  'walk.label.canvas': 'The ground around {site} in 3D, with the two routes, the goal and the rover',
  'walk.label.map': 'Map of the two routes, the goal and the rover',
  'walk.degrees': '{value}°',
}

export const pt: Record<keyof typeof en, string> = {
  'walk.title': 'Caminhar na superfície',
  'walk.intro':
    'O chão é a grade de perigo que o servidor devolve, em blocos de 50 m. Nada é acrescentado: nem crateras a mais, nem rochas.',
  'walk.plan': 'Plano',
  'walk.plan.normal': 'Navegação Normal',
  'walk.plan.multiresolution': 'Multirresolução',
  'walk.mode': 'Condução',
  'walk.mode.manual': 'Manual',
  'walk.mode.auto': 'Autônoma',
  'walk.start': 'Iniciar',
  'walk.pause': 'Pausar',
  'walk.reset': 'Voltar ao início',
  'walk.sun': '☀️ Virar ao Sol',
  'walk.sun.label': 'Virar ao Sol (F)',
  'walk.sun.none': 'Não há azimute do Sol para esta vista.',
  'walk.view.rover': 'Seguir o rover',
  'walk.view.top': 'Ver de cima',
  'walk.keys':
    'Clique na vista, dirija com W A S D ou com as setas e aperte F para virar ao Sol. Qualquer tecla assume o lugar da condução autônoma.',
  'walk.pad.forward': 'Frente',
  'walk.pad.back': 'Ré',
  'walk.pad.left': 'Virar à esquerda',
  'walk.pad.right': 'Virar à direita',
  'walk.t.heading': 'Rumo',
  'walk.t.distance': 'Distância',
  'walk.t.height': 'Altura',
  'walk.t.slope': 'Declive a 5 m',
  'walk.t.battery': 'Bateria no plano',
  'walk.t.steep': 'Chão íngreme pisado',
  'walk.t.rays': 'Raios',
  'walk.battery.off': 'longe do plano',
  'walk.battery.note':
    'A bateria é o número do próprio plano no waypoint mais perto do rover, de {wh} Wh. A caminhada não a gasta.',
  'walk.rays.none': 'Sem raios: esta rota foi pedida sem o azimute do Sol.',
  'walk.rays.note': 'Os raios amarelos são ilustração. Não dão energia, e a bateria não muda quando você pega um.',
  'walk.light.note':
    'A luz vem da direção do Sol no Cursor e só dá relevo às encostas. Aqui ela não projeta sombras, então a Fração do Sol não é desenhada.',
  'walk.pace.note': 'A caminhada passa bem mais rápido do que o rover anda. A condução do plano leva {hours} h.',
  'walk.estimate':
    'Nosso grupo estimou, a partir dos custos e da velocidade supostos do planejador e da inclinação do chão a 5 m, que este plano percorre {distance} m em {hours} h e pisa em {hazards} pontos íngremes. Pode conter erros. O plano é avaliado na mesma inclinação de 5 m com que foi planejado, e não temos uma faixa medida para isso.',
  'walk.summary': '{distance} m · {hours} h · {hazards} waypoints íngremes · {reached}',
  'walk.reached.yes': 'chega ao destino',
  'walk.reached.no': 'não chega ao destino',
  'walk.arrived': 'O rover chegou ao fim do plano.',
  'walk.legend.steep': 'Mais íngreme que o limite do Rover a 5 m',
  'walk.legend.measured': 'Medido pelo laser',
  'walk.legend.normal': 'Rota da Navegação Normal',
  'walk.legend.multiresolution': 'Rota da Multirresolução',
  'walk.legend.rays': 'Raios (ilustração)',
  'walk.legend.goal': 'Destino',
  'walk.legend.rover': 'Rover',
  'walk.loading': 'Carregando o chão…',
  'walk.retry': 'Tentar de novo',
  'walk.error.title': 'Não foi possível carregar o chão',
  'walk.error.network': 'O servidor não respondeu. Verifique a conexão e tente de novo.',
  'walk.error.busy': 'O servidor está ocupado agora. Tente de novo em alguns segundos.',
  'walk.error.no_hazard_grid': 'Não há grade de chão a menos de 15 km deste Local.',
  'walk.error.missing_site': 'Este Local não existe.',
  'walk.error.unknown': 'Algo deu errado ao carregar o chão.',
  'walk.flat': 'O 3D não está disponível neste navegador, então a caminhada roda no mapa plano.',
  'walk.label.canvas': 'O chão em volta de {site} em 3D, com as duas rotas, o destino e o rover',
  'walk.label.map': 'Mapa das duas rotas, do destino e do rover',
  'walk.degrees': '{value}°',
}

export type WalkKey = keyof typeof en
export type WalkLocale = 'en' | 'pt'

export type WalkText = (key: WalkKey, params?: Record<string, string>) => string

/** The text function of a language, filling `{name}` slots from `params`. */
export function walkText(locale: WalkLocale): WalkText {
  const catalogue: Record<WalkKey, string> = locale === 'pt' ? pt : en
  return (key, params) => {
    const text = catalogue[key]
    return params ? text.replace(/\{(\w+)\}/g, (slot, name: string) => params[name] ?? slot) : text
  }
}

/** The message for a problem `code` from the API, or the generic one. */
export function errorKey(code: string): WalkKey {
  const known = new Map<string, WalkKey>([
    ['network', 'walk.error.network'],
    ['busy', 'walk.error.busy'],
    ['no_hazard_grid', 'walk.error.no_hazard_grid'],
    ['missing_site', 'walk.error.missing_site'],
  ])
  return known.get(code) ?? 'walk.error.unknown'
}
