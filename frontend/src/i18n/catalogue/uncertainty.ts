// The DEM Uncertainty band (ADR 0003): the window an Event can fall in and the range of a metric
// once the map's own height error is counted. Under the Countdown and in "Stats for nerds".
export const en = {
  'uncertainty.between': 'between {from} and {to} with the map’s height error',
  'uncertainty.around': 'around {time} with the map’s height error',
  'uncertainty.maybe': 'with the map’s height error it may not happen at all: only in {count} of {total} versions of the terrain',
  'uncertainty.none': 'with the map’s height error it may not happen at all: in none of {total} versions of the terrain',
  'uncertainty.working': 'working out the band… {done} of {total}',
  'uncertainty.range': 'with the map’s height error: {low} to {high}',
}

export const pt: Record<keyof typeof en, string> = {
  'uncertainty.between': 'entre {from} e {to} com o erro de altura do mapa',
  'uncertainty.around': 'por volta de {time} com o erro de altura do mapa',
  'uncertainty.maybe': 'com o erro de altura do mapa, pode nem acontecer: só em {count} de {total} versões do relevo',
  'uncertainty.none': 'com o erro de altura do mapa, pode nem acontecer: em nenhuma das {total} versões do relevo',
  'uncertainty.working': 'calculando a faixa… {done} de {total}',
  'uncertainty.range': 'com o erro de altura do mapa: {low} a {high}',
}
