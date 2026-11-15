// Copy of the "if the lander misses" panel (requirement the implementation), in English and Portuguese.
// Registered in src/i18n/messages.ts. Directions, distances, durations and the error messages come from the app's own catalogue.

export const en = {
  'miss.title': 'If the lander misses',
  'miss.radiusLabel': 'Miss by',
  'miss.radiusMetres': '{value}\u00a0m',
  'miss.radiusHint100': '100\u00a0m is the landing accuracy NASA asks of Artemis III.',
  'miss.radiusHint250': '250\u00a0m is how far IM-2 Athena came down from its target, as Intuitive Machines reported.',
  'miss.radiusHint500': '500\u00a0m is twice the IM-2 miss.',

  'miss.loadingScatter':
    'Asking the same Query at 19 points around the Site. A new answer takes about a minute; the rest of the screen is ready now.',
  'miss.waited': '{value}\u00a0s so far',
  'miss.busy':
    'The server is busy working out other answers. Try again in a few seconds; nothing else on the screen waits for this.',
  'miss.steady': 'Missing by {radius} changes nothing here: all 19 points get the same hours of Sun and Earth, to the minute.',
  'miss.dropTo':
    'Land {distance} to the {direction} and the Sun-and-Earth time falls from {from} to {to}.',
  'miss.dropToNone':
    'Land {distance} to the {direction} and the lander never has the Sun and the Earth at the same time. At the Site it has them together for {from}.',
  'miss.siteWorst':
    'The Site is already the worst of the 19 points for Sun-and-Earth time. Within {radius} it only gets better, up to {to}.',
  'miss.nightFromNone': '{distance} to the {direction} the longest night lasts {to}. At the Site the Sun never sets.',
  'miss.nightFrom': '{distance} to the {direction} the longest night lasts {to}, against {from} at the Site.',
  'miss.notForSiteScatter':
    'The 20\u00a0m map ends too close to this Site, so the app can’t compute every point around it.',

  'miss.figureCaption':
    'Seen from above, north up. Each point is the same Query asked {inner} and {outer} from the Site. How full a point is shows its share of the Window for this metric: {metric}.',
  'miss.figureNorth': 'N',
  'miss.figureSite': 'Site',
  'miss.figureWorst': 'worst',

  'miss.tableCaption': 'Each metric at the Site and across the 19 points',
  'miss.tableMetric': 'Metric',
  'miss.tableSite': 'At the Site',
  'miss.tableRange': 'Across the 19 points',
  'miss.tableFromTo': '{min} to {max}',
  'miss.tableShow': 'Draw {metric} on the points',

  'miss.landingNotMap':
    'This is landing error: the same map, read where the lander may really come down. How wrong the map itself may be is a separate question, and the Resolution ladder answers that one.',
  'miss.openLadder': 'Open the Resolution ladder',

  'miss.slopeTitle': 'The ground within {radius}',
  'miss.loadingSlope': 'Measuring the slope on the {resolution} map…',
  'miss.slopeSay':
    'Within {radius} of the Site, half the ground is flatter than {median} and 95\u00a0% is flatter than {p95}. The steepest cell is {max}.',
  'miss.slopeLimit': 'NASA asks for under {limit} over 100\u00a0m for Artemis III. Here {share} of the cells are under it.',
  'miss.slopeMedian': 'Half the ground flatter than',
  'miss.slopeP95': 'Steepest 5\u00a0% from',
  'miss.slopeMax': 'Steepest cell',
  'miss.slopeShare': 'Cells under {limit}',
  'miss.slopeCells': '{cells} cells of {resolution} on {product}',
  'miss.slopeAxis': 'Slope in degrees, from flat to {top}',
  'miss.markMedian': 'median',
  'miss.markP95': '95\u00a0%',
  'miss.markMax': 'max',
  'miss.slopeLimitMark': 'NASA {limit}',
  'miss.slopeSource': 'Limit: NASA, “Artemis Human Landing System Overview”, Space Apps 2025, NTRS 20250009323.',
  'miss.slopeCaveat': 'A {resolution} map can’t see boulders or craters a few metres across.',
  'miss.athena': 'Athena tipped over in a crater about 20\u00a0m wide, which a map like this one misses.',
  'miss.athenaHere':
    'At the IM-2 landing point no cell within {radius} is steeper than {max} on this map. Athena still tipped over, in a crater too small for the map to see.',
  'miss.notForSiteSlope': 'No 20\u00a0m map covers this Site, so its slope can’t be measured here.',

  'miss.psr': 'The nearest permanently shadowed region is {distance} to the {direction} ({product}).',

  'miss.degrees': '{value}°',
}

export const pt: Record<keyof typeof en, string> = {
  'miss.title': 'Se o módulo errar o alvo',
  'miss.radiusLabel': 'Erro de',
  'miss.radiusMetres': '{value}\u00a0m',
  'miss.radiusHint100': '100\u00a0m é a precisão de pouso que a NASA pede para o Artemis III.',
  'miss.radiusHint250': '250\u00a0m foi o quanto o IM-2 Athena errou o alvo, segundo a Intuitive Machines.',
  'miss.radiusHint500': '500\u00a0m é o dobro do erro do IM-2.',

  'miss.loadingScatter':
    'Fazendo a mesma Consulta em 19 pontos ao redor do Local. Uma resposta nova leva cerca de um minuto; o resto da tela já está pronto.',
  'miss.waited': '{value}\u00a0s até agora',
  'miss.busy':
    'O servidor está ocupado calculando outras respostas. Tente de novo em alguns segundos; nada mais na tela espera por isto.',
  'miss.steady': 'Errar por {radius} não muda nada aqui: os 19 pontos têm as mesmas horas de Sol e de Terra, ao minuto.',
  'miss.dropTo': 'Pouse {distance} a {direction} e o tempo de Sol e Terra juntos cai de {from} para {to}.',
  'miss.dropToNone':
    'Pouse {distance} a {direction} e o módulo nunca tem Sol e Terra ao mesmo tempo. No Local ele tem os dois juntos por {from}.',
  'miss.siteWorst':
    'O Local já é o pior dos 19 pontos em tempo de Sol e Terra juntos. Num raio de {radius} só melhora, até {to}.',
  'miss.nightFromNone': 'A {distance} a {direction}, a maior noite dura {to}. No Local o Sol não se põe.',
  'miss.nightFrom': 'A {distance} a {direction}, a maior noite dura {to}, contra {from} no Local.',
  'miss.notForSiteScatter': 'O mapa de 20\u00a0m acaba perto demais deste Local, e o app não consegue calcular todos os pontos ao redor.',

  'miss.figureCaption':
    'Visto de cima, com o norte para cima. Cada ponto é a mesma Consulta feita a {inner} e a {outer} do Local. O quanto o ponto está cheio mostra a fração da Janela nesta métrica: {metric}.',
  'miss.figureNorth': 'N',
  'miss.figureSite': 'Local',
  'miss.figureWorst': 'pior',

  'miss.tableCaption': 'Cada métrica no Local e nos 19 pontos',
  'miss.tableMetric': 'Métrica',
  'miss.tableSite': 'No Local',
  'miss.tableRange': 'Nos 19 pontos',
  'miss.tableFromTo': 'de {min} a {max}',
  'miss.tableShow': 'Desenhar {metric} nos pontos',

  'miss.landingNotMap':
    'Isto é erro de pouso: o mesmo mapa, lido onde o módulo pode descer de verdade. O quanto o próprio mapa pode estar errado é outra pergunta, e quem responde é a escada de resoluções.',
  'miss.openLadder': 'Abrir a escada de resoluções',

  'miss.slopeTitle': 'O chão num raio de {radius}',
  'miss.loadingSlope': 'Medindo a inclinação no mapa de {resolution}…',
  'miss.slopeSay':
    'Num raio de {radius} do Local, metade do chão tem menos de {median} de inclinação e 95\u00a0% tem menos de {p95}. A célula mais íngreme tem {max}.',
  'miss.slopeLimit': 'A NASA pede menos de {limit} em 100\u00a0m para o Artemis III. Aqui {share} das células ficam abaixo disso.',
  'miss.slopeMedian': 'Metade do chão abaixo de',
  'miss.slopeP95': 'Os 5\u00a0% mais íngremes a partir de',
  'miss.slopeMax': 'Célula mais íngreme',
  'miss.slopeShare': 'Células abaixo de {limit}',
  'miss.slopeCells': '{cells} células de {resolution} em {product}',
  'miss.slopeAxis': 'Inclinação em graus, de plano a {top}',
  'miss.markMedian': 'mediana',
  'miss.markP95': '95\u00a0%',
  'miss.markMax': 'máx.',
  'miss.slopeLimitMark': 'NASA {limit}',
  'miss.slopeSource': 'Limite: NASA, “Artemis Human Landing System Overview”, Space Apps 2025, NTRS 20250009323.',
  'miss.slopeCaveat': 'Um mapa de {resolution} não enxerga pedras nem crateras de poucos metros.',
  'miss.athena': 'O Athena tombou numa cratera de uns 20\u00a0m, que um mapa assim não mostra.',
  'miss.athenaHere':
    'No ponto de pouso do IM-2, nenhuma célula num raio de {radius} passa de {max} neste mapa. Mesmo assim o Athena tombou, numa cratera pequena demais para o mapa enxergar.',
  'miss.notForSiteSlope': 'Nenhum mapa de 20\u00a0m cobre este Local, então não dá para medir a inclinação aqui.',

  'miss.psr': 'A região em sombra permanente mais próxima fica a {distance} a {direction} ({product}).',

  'miss.degrees': '{value}°',
}
