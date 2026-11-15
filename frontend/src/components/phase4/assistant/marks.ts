// Pure helper: the answer cut into plain text and the untraced numbers, so the panel can flag
// them where they stand instead of hiding them (the requirement).

export type Piece = { text: string; untraced: boolean; number: boolean }

const isDigit = (char: string | undefined) => char !== undefined && /[0-9]/.test(char)

/**
 * Splits `answer` around each untraced number, in the order the backend lists them. A number
 * only matches as a whole: "41" is not found inside "1412".
 */
export function markUntraced(answer: string, untraced: readonly string[]): Piece[] {
  const pieces: Piece[] = []
  let from = 0
  for (const number of untraced) {
    let at = answer.indexOf(number, from)
    while (at !== -1 && (isDigit(answer[at - 1]) || isDigit(answer[at + number.length]))) {
      at = answer.indexOf(number, at + 1)
    }
    if (at === -1) continue
    if (at > from) pieces.push(...numbers(answer.slice(from, at)))
    pieces.push({ text: number, untraced: true, number: true })
    from = at + number.length
  }
  if (from < answer.length) pieces.push(...numbers(answer.slice(from)))
  return pieces
}

/** Every number set apart from the words, so it can be set in the mono like the app's statements. */
function numbers(text: string): Piece[] {
  return text
    .split(/(\d+(?:[.,:]\d+)*)/)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, untraced: false, number: /^\d/.test(part) }))
}
