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

/** Swaps every box, status and arrow glyph for a single ASCII character. (spec `ascii`) */
export const toAscii = (line: string): string =>
  line
    .replace(/[╭╮╰╯├┤┬┴]/g, '+').replace(/[│┃]/g, '|').replace(/─/g, '-').replace(/▸/g, '>')
    .replace(/⠋/g, '*').replace(/◔/g, '!').replace(/[✓]/g, '+').replace(/✗/g, 'x').replace(/█/g, '#')
    .replace(/░/g, '-').replace(/…/g, '~').replace(/·/g, '.').replace(/●/g, '*').replace(/◌/g, '.')
    .replace(/▲/g, '^').replace(/↑/g, '^').replace(/↓/g, 'v').replace(/—/g, '-').replace(/›/g, '>')
    .replace(/→/g, '>')
