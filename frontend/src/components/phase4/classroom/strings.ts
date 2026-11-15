// The Classroom figure (requirement the implementation). Glossary: Classroom figure, Site, Sunset; the hill is not an
// Occluder here, because the model has no terrain of the app's. Plain data: messages.ts spreads it
// into the app's catalogues, so `t` reads these keys.
export const en = {
  'class.title': 'Why does one small hill matter so much?',
  'class.close': 'Close',
  'class.say':
    'A hill 300\u00a0m high and 10\u00a0km away stands {hill} above the horizon. At the pole the Sun never climbs more than about {tilt}.',
  'class.model': 'Classroom model',
  'class.modelNote': 'A smooth Moon with one hill, drawn to show the idea. The app’s answers come from the engine, never from this figure.',
  'class.latitude': 'Latitude',
  'class.latitudeValue': '{value}° S',
  'class.pole': '90° S, the pole',
  'class.highest': 'Highest Sun here',
  'class.hill': 'Top of the hill',
  'class.hidden': 'The hill hides the Sun for {span} of every lunar day.',
  'class.summer': 'Sun’s path in southern summer',
  'class.winter': 'in southern winter',
  'class.hillLabel': 'hill, 300\u00a0m at 10\u00a0km',
  'class.figure': 'The Sun’s path over one lunar day at {lat}, with a hill to the east.',
  'class.N': 'N',
  'class.E': 'E',
  'class.S': 'S',
  'class.W': 'W',
}

export type ClassKey = keyof typeof en

export const pt: Record<ClassKey, string> = {
  'class.title': 'Por que um morro pequeno pesa tanto?',
  'class.close': 'Fechar',
  'class.say': 'Um morro de 300\u00a0m a 10\u00a0km de distância fica {hill} acima do horizonte. No polo, o Sol nunca sobe mais que cerca de {tilt}.',
  'class.model': 'Modelo de aula',
  'class.modelNote': 'Uma Lua lisa com um morro, desenhada para mostrar a ideia. As respostas do app vêm do motor, nunca desta figura.',
  'class.latitude': 'Latitude',
  'class.latitudeValue': '{value}° S',
  'class.pole': '90° S, o polo',
  'class.highest': 'Sol mais alto aqui',
  'class.hill': 'Topo do morro',
  'class.hidden': 'O morro esconde o Sol por {span} a cada dia lunar.',
  'class.summer': 'Caminho do Sol no verão do sul',
  'class.winter': 'no inverno do sul',
  'class.hillLabel': 'morro de 300\u00a0m a 10\u00a0km',
  'class.figure': 'O caminho do Sol num dia lunar a {lat}, com um morro a leste.',
  'class.N': 'N',
  'class.E': 'L',
  'class.S': 'S',
  'class.W': 'O',
}
