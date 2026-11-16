// The words of the panel beside the view from the ground after a landing, in both languages.
// Glossary terms as written in GLOSSARY.md (pt: Local, Janela, Cursor). Plain data: messages.ts spreads
// it into the app's catalogues. Between a number and its unit goes a no-break space.
// The note repeats the definitions of the contract (Metrics.sunlit_hours, TimelineSample.earth.visible)
// and of GLOSSARY.md (Earth visible, DSN link), so it says no more than the backend does.

export const en = {
  'landingPanel.label': 'Your landing',
  'landingPanel.hide': 'Hide the landing panel',
  'landingPanel.show': 'Show the landing panel',
  'landingPanel.vehicle': 'Vehicle: {name}',
  'landingPanel.window': '{start} → {end} UTC',
  'landingPanel.summary': 'In the chosen Window',
  'landingPanel.sun': 'Sun',
  'landingPanel.earth': 'Earth',
  'landingPanel.both': 'Both',
  'landingPanel.share': '{duration} · {percent}',
  'landingPanel.longestNight': 'Longest night',
  'landingPanel.longestNoEarth': 'Longest without the Earth',
  'landingPanel.energy': 'Energy periods',
  'landingPanel.charge': 'Solar charge',
  'landingPanel.battery': 'Battery',
  'landingPanel.comms': 'Earth communication',
  'landingPanel.link': 'Link',
  'landingPanel.noLink': 'No link',
  'landingPanel.span': '{start} → {end}',
  'landingPanel.hint': 'Tap a period to jump there on the timeline.',
  'landingPanel.hours': '{hours} h',
  'landingPanel.hoursDays': '{hours} h ({days} d)',
  'landingPanel.countdown': 'Countdown',
  'landingPanel.noteSite':
    'Sun: part of the Sun is above the hills around the lander. Earth: the Earth is above them, so the lander can talk to home.',
  'landingPanel.note':
    'Sun: part of the Sun is above the hills around the lander. Earth: the Earth is above them, so the lander can talk to home. Link means only that the Earth is in view; a real call also needs a dish on Earth pointed at the Moon.',
}

export const pt: Record<keyof typeof en, string> = {
  'landingPanel.label': 'Informações do pouso',
  'landingPanel.hide': 'Esconder o painel do pouso',
  'landingPanel.show': 'Mostrar o painel do pouso',
  'landingPanel.vehicle': 'Veículo: {name}',
  'landingPanel.window': '{start} → {end} UTC',
  'landingPanel.summary': 'Na Janela escolhida',
  'landingPanel.sun': 'Sol',
  'landingPanel.earth': 'Terra',
  'landingPanel.both': 'Os dois',
  'landingPanel.share': '{duration} · {percent}',
  'landingPanel.longestNight': 'Maior noite',
  'landingPanel.longestNoEarth': 'Maior tempo sem a Terra',
  'landingPanel.energy': 'Períodos de energia',
  'landingPanel.charge': 'Carga solar',
  'landingPanel.battery': 'Bateria',
  'landingPanel.comms': 'Comunicação com a Terra',
  'landingPanel.link': 'Com link',
  'landingPanel.noLink': 'Sem link',
  'landingPanel.span': '{start} → {end}',
  'landingPanel.hint': 'Escolha um período para levar o Cursor ao início dele.',
  'landingPanel.hours': '{hours} h',
  'landingPanel.hoursDays': '{hours} h ({days} d)',
  'landingPanel.countdown': 'Contagem regressiva',
  'landingPanel.noteSite':
    'As contagens regressivas são lidas no Cursor. Sol visível: alguma parte do disco do Sol está acima da máscara do horizonte, o horizonte do relevo. Terra visível: o centro da Terra está acima da máscara do horizonte, então a comunicação direta com a Terra é geometricamente possível.',
  'landingPanel.note':
    'Os períodos vêm do backend. Sol visível: alguma parte do disco do Sol está acima da máscara do horizonte, o horizonte do relevo. Terra visível: o centro da Terra está acima da máscara do horizonte, então a comunicação direta com a Terra é geometricamente possível. “Com link” é só essa geometria; um link DSN também precisa de uma antena com a Lua à vista.',
}
