// The words of the answer card and the details drawer of the default layout, in both languages. The card
// holds the sentence, the Countdown and the band; the drawer holds the rest of what the answer column holds.

const en = {
  card: 'The answer',
  details: 'Details',
  title: 'Details of the answer',
  close: 'Close',
}

type Strings = typeof en

const pt: Strings = {
  card: 'A resposta',
  details: 'Detalhes',
  title: 'Detalhes da resposta',
  close: 'Fechar',
}

export const STRINGS: Record<'en' | 'pt', Strings> = { en, pt }
