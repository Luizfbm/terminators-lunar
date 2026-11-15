// The line without terrain and the Window without terrain (requirement the implementation). Glossary terms as in
// GLOSSARY.md: Flat horizon, Sunset, Sunrise, Window, Query, Observer height, LCIP, LCSP.
// Plain data: messages.ts spreads it into the app's catalogues, so `t` reads these keys.
export const en = {
  'flat.sunset.later': 'Without terrain the Sun would set {span} later.',
  'flat.sunset.earlier': 'Without terrain the Sun would set {span} earlier.',
  'flat.sunset.same': 'Without terrain the Sun would set at the same minute.',
  'flat.sunset.never': 'Without terrain the Sun would not set before {date}, 180\u00a0days after this Window.',
  'flat.sunset.neverShort': 'Without terrain the Sun would not set before {date}, where our data ends.',
  'flat.sunset.at': 'Without terrain the Sun would set on {date}.',
  'flat.sunset.notInWindow': 'Without terrain the Sun would not set in this Window either. It would first set on {date}.',
  'flat.sunrise.later': 'Without terrain the Sun would rise {span} later.',
  'flat.sunrise.earlier': 'Without terrain the Sun would rise {span} earlier.',
  'flat.sunrise.same': 'Without terrain the Sun would rise at the same minute.',
  'flat.sunrise.never': 'Without terrain the Sun would not rise before {date}, 180\u00a0days after this Window.',
  'flat.sunrise.neverShort': 'Without terrain the Sun would not rise before {date}, where our data ends.',
  'flat.sunrise.at': 'Without terrain the Sun would rise on {date}.',
  'flat.sunrise.notInWindow': 'Without terrain the Sun would not rise in this Window either. It would first rise on {date}.',
  'flat.up': 'Without terrain the Sun would be up right now. The terrain hides it.',
  'flat.down': 'Without terrain the Sun would already have set. This Site sits high enough to see past the flat horizon.',
  'flat.loading': 'Working out the same Query without terrain…',
  'flat.label': 'Without terrain',
  'flatMetrics.open': 'How much of this answer is the terrain?',
  'flatMetrics.loading': 'Working out this Window without terrain…',
  'flatMetrics.say': 'Without terrain this Window would have {flat} of Sun and Earth together. With the terrain it has {real}.',
  'flatMetrics.sayNoChange': 'Without terrain this Window would have the same {real} of Sun and Earth together.',
  'flatMetrics.caption': 'This Window with and without terrain',
  'flatMetrics.real': 'With terrain',
  'flatMetrics.none': 'none',
  'flatMetrics.flat': 'Without terrain',
  'flatMetrics.note':
    'Without terrain, the Moon is a smooth sphere of 1,737.4\u00a0km and the horizon sits {dip} below level because of the Observer height. The ephemeris and the definition of Sunset are the same.',
  'flatMetrics.noteGround':
    'Without terrain, the Moon is a smooth sphere of 1,737.4\u00a0km, seen from the ground. The ephemeris and the definition of Sunset are the same.',
}

export type FlatKey = keyof typeof en

export const pt: Record<FlatKey, string> = {
  'flat.sunset.later': 'Sem relevo, o Sol se poria {span} mais tarde.',
  'flat.sunset.earlier': 'Sem relevo, o Sol se poria {span} mais cedo.',
  'flat.sunset.same': 'Sem relevo, o Sol se poria no mesmo minuto.',
  'flat.sunset.never': 'Sem relevo, o Sol não se poria antes de {date}, 180\u00a0dias depois desta Janela.',
  'flat.sunset.neverShort': 'Sem relevo, o Sol não se poria antes de {date}, onde acabam nossos dados.',
  'flat.sunset.at': 'Sem relevo, o Sol se poria em {date}.',
  'flat.sunset.notInWindow': 'Sem relevo, o Sol também não se poria nesta Janela. O primeiro pôr do Sol seria em {date}.',
  'flat.sunrise.later': 'Sem relevo, o Sol nasceria {span} mais tarde.',
  'flat.sunrise.earlier': 'Sem relevo, o Sol nasceria {span} mais cedo.',
  'flat.sunrise.same': 'Sem relevo, o Sol nasceria no mesmo minuto.',
  'flat.sunrise.never': 'Sem relevo, o Sol não nasceria antes de {date}, 180\u00a0dias depois desta Janela.',
  'flat.sunrise.neverShort': 'Sem relevo, o Sol não nasceria antes de {date}, onde acabam nossos dados.',
  'flat.sunrise.at': 'Sem relevo, o Sol nasceria em {date}.',
  'flat.sunrise.notInWindow': 'Sem relevo, o Sol também não nasceria nesta Janela. O primeiro nascer do Sol seria em {date}.',
  'flat.up': 'Sem relevo, o Sol estaria no céu agora. O relevo o esconde.',
  'flat.down': 'Sem relevo, o Sol já teria se posto. Este Local fica alto o bastante para ver além do horizonte plano.',
  'flat.loading': 'Calculando a mesma Consulta sem relevo…',
  'flat.label': 'Sem relevo',
  'flatMetrics.open': 'Quanto desta resposta vem do relevo?',
  'flatMetrics.loading': 'Calculando esta Janela sem relevo…',
  'flatMetrics.say': 'Sem relevo, esta Janela teria {flat} de Sol e Terra juntos. Com o relevo, tem {real}.',
  'flatMetrics.sayNoChange': 'Sem relevo, esta Janela teria os mesmos {real} de Sol e Terra juntos.',
  'flatMetrics.caption': 'Esta Janela com e sem relevo',
  'flatMetrics.real': 'Com relevo',
  'flatMetrics.none': 'nenhuma',
  'flatMetrics.flat': 'Sem relevo',
  'flatMetrics.note':
    'Sem relevo, a Lua é uma esfera lisa de 1.737,4\u00a0km e o horizonte fica {dip} abaixo do nível por causa da altura do Observador. As efemérides e a definição de pôr do Sol são as mesmas.',
  'flatMetrics.noteGround':
    'Sem relevo, a Lua é uma esfera lisa de 1.737,4\u00a0km, vista do chão. As efemérides e a definição de pôr do Sol são as mesmas.',
}
