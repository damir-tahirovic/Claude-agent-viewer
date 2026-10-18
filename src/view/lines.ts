// Line helpers for the "{codes|text}" format. Ported from docs/design/spec-generator.js.

/** Spinner frames; the dialog shows one of them for running agents. */
export const SPIN: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Wraps text in color codes; empty text gives '' and empty codes give bare text. (spec `C`, with the render-spec.js patch) */
export const colorize = (codes: string, text: string): string =>
  text ? (codes ? `{${codes}|${text}}` : text) : ''

/** Dim text. (spec `D`) */
export const dim = (text: string): string => colorize('d', text)

/** Removes color codes, leaving the visible text. (spec `strip`) */
export const stripCodes = (line: string): string => line.replace(/\{[a-zA-Z]+\|([^{}]*)\}/g, '$1')

/** Number of visible characters in a coded line. (spec `vl`) */
export const visibleLength = (line: string): number => [...stripCodes(line)].length

/** Pads a coded line with spaces on the right up to the width. (spec `padR`) */
export const padRight = (line: string, width: number): string =>
  line + ' '.repeat(Math.max(0, width - visibleLength(line)))

/** Pads plain text with spaces on the left up to the width. (spec `padL`) */
export const padLeft = (text: string, width: number): string =>
  ' '.repeat(Math.max(0, width - [...text].length)) + text

/** Pads plain text to the width, or cuts it with an ellipsis. (spec `fit`) */
export const fitText = (text: string, width: number): string => {
  const chars = [...text]
  return chars.length <= width
    ? text + ' '.repeat(width - chars.length)
    : chars.slice(0, Math.max(0, width - 1)).join('') + '…'
}

/** Cuts plain text with an ellipsis when it is too long, without padding it. (graph generator `fit`) */
export const fitNoPad = (text: string, width: number): string => {
  const chars = [...text]
  return chars.length <= width ? text : chars.slice(0, Math.max(0, width - 1)).join('') + '…'
}

/** Cuts a coded line to at most `width` visible characters, keeping the codes of what stays. */
export const clipLine = (line: string, width: number): string => {
  if (visibleLength(line) <= width) return line
  let room = width
  let out = ''
  for (const part of line.split(/(\{[a-zA-Z]+\|[^{}]*\})/)) {
    if (room <= 0) break
    const group = /^\{([a-zA-Z]+)\|([^{}]*)\}$/.exec(part)
    const text = [...(group ? group[2] : part)].slice(0, room).join('')
    room -= [...text].length
    out += group && text ? `{${group[1]}|${text}}` : text
  }
  return out
}

/** Swaps every box, status and arrow glyph for a single ASCII character. (spec `ascii`) */
export const toAscii = (line: string): string =>
  line
    .replace(/[╭╮╰╯├┤┬┴]/g, '+').replace(/[│┃]/g, '|').replace(/─/g, '-').replace(/▸/g, '>').replace(/◂/g, '<')
    .replace(/⠋/g, '*').replace(/◔/g, '!').replace(/[✓]/g, '+').replace(/✗/g, 'x').replace(/█/g, '#')
    .replace(/░/g, '-').replace(/…/g, '~').replace(/·/g, '.').replace(/●/g, '*').replace(/◌/g, '.')
    .replace(/▲/g, '^').replace(/↑/g, '^').replace(/↓/g, 'v').replace(/—/g, '-').replace(/›/g, '>')
    .replace(/→/g, '>')

/**
 * `toAscii` plus the corner and return glyphs the generator leaves alone. Kept separate so the golden
 * ascii screens, which still show those corners, stay byte-identical.
 */
export const toPlainAscii = (line: string): string => toAscii(line).replace(/[└┘┌┐]/g, '+').replace(/⏎/g, 'Enter').replace(/–/g, '-')

/** Keeps the visible characters from `from` up to (not including) `to` of a coded line, keeping their codes. */
export const sliceColumns = (line: string, from: number, to: number): string => {
  let position = 0
  let out = ''
  for (const part of line.split(/(\{[a-zA-Z]+\|[^{}]*\})/)) {
    const group = /^\{([a-zA-Z]+)\|([^{}]*)\}$/.exec(part)
    const chars = [...(group ? group[2] : part)]
    const text = chars.slice(Math.max(0, from - position), Math.max(0, to - position)).join('')
    position += chars.length
    out += group && text ? `{${group[1]}|${text}}` : text
  }
  return out
}
