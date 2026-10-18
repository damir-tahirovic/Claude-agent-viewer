// Frame and layout helpers shared by the view renderers. Ported from docs/design/spec-generator.js.
import { colorize, dim, padRight, visibleLength } from './lines'

/** Top border with a left and a right title. (spec `top`) */
export const topBorder = (W: number, left: string, right: string): string =>
  dim('╭─ ') + left + dim(' ' + '─'.repeat(Math.max(1, W - 8 - visibleLength(left) - visibleLength(right))) + ' ') +
  right + dim(' ─╮')

/** Bottom border. (spec `bottom`) */
export const bottomBorder = (W: number): string => dim('╰' + '─'.repeat(W - 2) + '╯')

/** Horizontal rule; without a frame it has no corner pieces. (spec `rule`) */
export const rule = (W: number, hasFrame: boolean): string =>
  hasFrame ? dim('├' + '─'.repeat(W - 2) + '┤') : dim('─'.repeat(W - 2))

/** One text line inside the frame. (spec `txt`) */
export const textLine = (W: number, s: string, hasFrame: boolean): string =>
  hasFrame ? dim('│') + ' ' + padRight(s, W - 4) + ' ' + dim('│') : ' ' + padRight(s, W - 4) + ' '

/** Progress bar of filled and empty blocks. (spec `bar`) */
export const progressBar = (n: number, total: number, width: number, codes: string): string => {
  const filled = Math.round(n / total * width)
  return colorize(codes, '█'.repeat(filled)) + dim('░'.repeat(width - filled))
}

/** Key hints joined by gaps. (spec `hints`) */
export const renderHints = (list: [string, string][]): string =>
  list.map(([key, label]) => colorize('B', key) + dim(' ' + label)).join('   ')
