// The words of the stage's own status: a landing on its way, and an answer that failed, shown over the
// picture because the column of answers is hidden (the requirement). Both languages.
// Glossary terms as written in GLOSSARY.md: Site is "Local" in Portuguese, Query "Consulta".

const en = {
  landing: 'Landing at {place}…',
  landingCustom: 'Computing the horizon at this point. It takes a few seconds.',
  loading: 'Loading the answer…',
  failedLanding: 'Could not land at {place}',
  failed: 'Could not answer this Query',
  outsideLimit: 'For now the server answers a point of your own only south of {limit}.',
  retry: 'Try again',
  cancel: 'Cancel',
  backToDefault: 'Back to the default Site',
}

type Strings = typeof en

const pt: Strings = {
  landing: 'Pousando em {place}…',
  landingCustom: 'Calculando o horizonte neste ponto. Leva alguns segundos.',
  loading: 'Carregando a resposta…',
  failedLanding: 'Não foi possível pousar em {place}',
  failed: 'Não foi possível responder esta Consulta',
  outsideLimit: 'Por enquanto o servidor só responde um ponto seu ao sul de {limit}.',
  retry: 'Tentar de novo',
  cancel: 'Cancelar',
  backToDefault: 'Voltar ao Local padrão',
}

export const STRINGS = { en, pt }
export type StageStatusKey = keyof Strings
