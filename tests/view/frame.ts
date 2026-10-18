import { GOLDEN } from '../../src/view/spec-golden'
import { stripCodes } from '../../src/view/lines'

// First line whose plain text starts with ╭ or "+-", through the first later line
// whose plain text starts with ╰ (or, in ASCII, the last line that starts with "+-").
/** The framed block of a golden screen. */
export const frameOf = (id: string): string[] => {
  const plain = GOLDEN[id].map(stripCodes)
  const first = plain.findIndex(l => l.startsWith('╭') || l.startsWith('+-'))
  let last = plain.findIndex((l, i) => i > first && l.startsWith('╰'))
  if (last < 0) {
    last = plain
      .map((l, i) => (i > first && l.startsWith('+-') ? i : -1))
      .reduce((m, i) => Math.max(m, i), -1)
  }
  return GOLDEN[id].slice(first, last + 1)
}
