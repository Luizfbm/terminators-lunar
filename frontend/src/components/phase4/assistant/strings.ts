// Every string of the assistant panel and its button, in both languages.
// Glossary terms as written in GLOSSARY.md.

const en = {
  button: 'Ask',
  buttonLabel: 'Ask the assistant',
  title: 'Ask about this Query',
  about: 'About {site}, {duration} from {start}',
  close: 'Close',
  closeLabel: 'Close the assistant',
  intro:
    'Ask in Portuguese or English. A language model reads the app’s own answers and writes a few sentences. It computes nothing, and the app checks every number it writes against the engine.',
  examplesTitle: 'Try one of these',
  example1: 'When does the Sun set next here, and what hides it?',
  example2: 'How many hours of this Window have both the Sun and the Earth?',
  example3: 'Which month of the year is best at this Site?',
  example4: 'What happens if the lander comes down 250 m off target?',
  you: 'You',
  assistant: 'Assistant',
  conversation: 'Conversation',
  trace: '{traced} of {total} numbers come from the engine',
  traceOne: 'The 1 number comes from the engine',
  traceNone: 'This answer has no numbers to check',
  untracedOne: '1 number is not in the engine’s answers. It is marked in the text; check it on the screen before you use it.',
  untracedMany: '{count} numbers are not in the engine’s answers. They are marked in the text; check them on the screen before you use them.',
  untracedMark: 'not in the engine’s answers',
  offline: 'Offline answer',
  offlineNote:
    'The language model was out of reach, so this answer comes from fixed sentences filled with the engine’s numbers.',
  sources: 'See it on the screen',
  source_getVisibility: 'The answer and its Numbers',
  source_getVisibilityLadder: 'The Resolution ladder',
  source_getSiteYear: 'The year at this Site',
  source_getSiteWindows: 'The best, typical and worst day to land',
  source_getVisibilityFlat: 'Without terrain',
  source_getVisibilityScatter: 'If the lander misses',
  source_getVisibilityEnergy: 'The battery',
  source_getVisibilityDsn: 'The DSN link',
  source_getTerrain: 'The Slope',
  source_listSites: 'The Sites',
  source_getSite: 'The Sites',
  source_listValidations: 'How we know these numbers',
  waiting: 'Reading the engine’s answers…',
  waitingLong: 'A long answer can take half a minute.',
  stop: 'Stop',
  busy: 'The assistant has too many questions right now. Ask again in {seconds} s. Your question is still in the box.',
  busyAfter: 'You can ask again now. Your question is still in the box.',
  failed: 'The assistant did not answer. Your question is still in the box, so try again. The numbers on the screen do not depend on it.',
  retry: 'Try again',
  failedNetwork: 'The server did not answer. Check the connection, then try again.',
  failedInvalid: 'The server could not read this question. Make it shorter, then try again.',
  label: 'Your question',
  hint: 'Enter sends it. Shift and Enter start a new line.',
  left: '{count} characters left',
  send: 'Ask',
  full: 'This conversation has reached its 10 questions. Start a new one to keep asking.',
  newConversation: 'New conversation',
  privacy: 'The conversation stays in this tab, and the app stores none of it.',
}

type Strings = typeof en

const pt: Strings = {
  button: 'Perguntar',
  buttonLabel: 'Perguntar ao assistente',
  title: 'Pergunte sobre esta Consulta',
  about: 'Sobre {site}, {duration} a partir de {start}',
  close: 'Fechar',
  closeLabel: 'Fechar o assistente',
  intro:
    'Pergunte em português ou inglês. Um modelo de linguagem lê as respostas do próprio app e escreve algumas frases. Ele não calcula nada, e o app confere cada número que ele escreve com o motor.',
  examplesTitle: 'Experimente uma destas',
  example1: 'Quando o Sol se põe aqui da próxima vez, e o que o esconde?',
  example2: 'Quantas horas desta Janela têm o Sol e a Terra juntos?',
  example3: 'Qual mês do ano é o melhor neste Local?',
  example4: 'O que acontece se o módulo pousar a 250 m do alvo?',
  you: 'Você',
  assistant: 'Assistente',
  conversation: 'Conversa',
  trace: '{traced} de {total} números vêm do motor',
  traceOne: 'O único número vem do motor',
  traceNone: 'Esta resposta não tem números para conferir',
  untracedOne: '1 número não está nas respostas do motor. Ele está marcado no texto; confira na tela antes de usar.',
  untracedMany: '{count} números não estão nas respostas do motor. Eles estão marcados no texto; confira na tela antes de usar.',
  untracedMark: 'não está nas respostas do motor',
  offline: 'Resposta offline',
  offlineNote:
    'O modelo de linguagem estava fora do ar, então esta resposta vem de frases prontas preenchidas com os números do motor.',
  sources: 'Veja na tela',
  source_getVisibility: 'A resposta e os Números',
  source_getVisibilityLadder: 'A escada de resolução',
  source_getSiteYear: 'O ano neste Local',
  source_getSiteWindows: 'O melhor, o típico e o pior dia para pousar',
  source_getVisibilityFlat: 'Sem relevo',
  source_getVisibilityScatter: 'Se o módulo errar o alvo',
  source_getVisibilityEnergy: 'A bateria',
  source_getVisibilityDsn: 'O link DSN',
  source_getTerrain: 'A inclinação',
  source_listSites: 'Os Locais',
  source_getSite: 'Os Locais',
  source_listValidations: 'Como sabemos estes números',
  waiting: 'Lendo as respostas do motor…',
  waitingLong: 'Uma resposta longa pode levar meio minuto.',
  stop: 'Parar',
  busy: 'O assistente está com perguntas demais agora. Pergunte de novo em {seconds} s. Sua pergunta continua na caixa.',
  busyAfter: 'Já dá para perguntar de novo. Sua pergunta continua na caixa.',
  failed: 'O assistente não respondeu. Sua pergunta continua na caixa, então tente de novo. Os números da tela não dependem dele.',
  retry: 'Tentar de novo',
  failedNetwork: 'O servidor não respondeu. Verifique a conexão e tente de novo.',
  failedInvalid: 'O servidor não conseguiu ler esta pergunta. Encurte e tente de novo.',
  label: 'Sua pergunta',
  hint: 'Enter envia. Shift e Enter quebram a linha.',
  left: 'Faltam {count} caracteres',
  send: 'Perguntar',
  full: 'Esta conversa chegou às 10 perguntas. Comece uma nova para continuar.',
  newConversation: 'Nova conversa',
  privacy: 'A conversa fica só nesta aba, e o app não guarda nada dela.',
}

export const STRINGS = { en, pt }
export type AskStrings = Strings

/** Fills `{name}` placeholders, as the app catalogue does. */
export function fill(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}

/** The view that shows the numbers of an operation, by its `operationId`. */
export function sourceLabel(strings: Strings, operation: string): string {
  const key = `source_${operation}` as keyof Strings
  return key in strings ? strings[key] : operation
}
