const moveTo = (row: number): string => `\x1b[${row + 1};1H`

/** Escape string that rewrites only the rows that changed between two painted screens. */
export const diffScreen = (
  previous: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
  rows: number,
): string => {
  const count = Math.min(Math.max(previous.length, next.length), rows)
  let out = ''
  for (let row = 0; row < count; row++) {
    const before = previous[row]
    const after = next[row]
    if (before === after) continue
    out += after === undefined ? `${moveTo(row)}\x1b[K` : `${moveTo(row)}${after}\x1b[K`
  }
  return out
}

/** Clears the terminal and draws every row of the screen. */
export const fullScreen = (next: ReadonlyArray<string>, rows: number): string =>
  `\x1b[H\x1b[2J${diffScreen([], next, rows)}`
