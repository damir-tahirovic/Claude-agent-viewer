// Parser for the "{codes|text}" line format; shared by the engine painter (src/mod) and the CLI (src/cli).

/** One styled run of a line: its style codes and the visible text. */
export type Run = { readonly codes: string; readonly text: string }

/** Ink color name for each color code. */
export const COLOR_OF_CODE: Readonly<Record<string, string>> = {
  c: 'cyan', y: 'yellow', g: 'green', r: 'red', b: 'blue',
}

const RUN_PATTERN = /\{([a-zA-Z]+)\|([^{}]*)\}/g

/** Splits a coded line into runs; text outside any group has empty codes. */
export const runs = (line: string): Run[] => {
  const out: Run[] = []
  let cursor = 0
  RUN_PATTERN.lastIndex = 0
  for (let match = RUN_PATTERN.exec(line); match; match = RUN_PATTERN.exec(line)) {
    if (match.index > cursor) out.push({ codes: '', text: line.slice(cursor, match.index) })
    out.push({ codes: match[1], text: match[2] })
    cursor = RUN_PATTERN.lastIndex
  }
  if (cursor < line.length) out.push({ codes: '', text: line.slice(cursor) })
  return out
}
