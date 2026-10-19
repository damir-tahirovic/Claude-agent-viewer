// Compact agent card: three rows for graphs with many workers. No counterpart in the generator; the full
// card in card.ts stays the reference.
import { fmtT } from '../../core/format'
import { fitNoPad, SPIN } from '../lines'
import type { Row, RowStatus } from '../rows'
import type { Canvas } from './canvas'
import { STATUS_CODE } from './style'

export type CompactCardOpts = {
  /** Spinner frame shown for a running agent. */
  readonly spin?: string
}

/** Height of a compact card in rows. */
export const COMPACT_CARD_HEIGHT = 3
/** Narrowest card that still shows a glyph, one name character and a time. */
const MIN_CARD_WIDTH = 6
/** From this width the type is set off from the border by a space on each side. */
const ROOMY_CARD_WIDTH = 12

const STATUS_WORD: Record<RowStatus, string> = {
  running: 'running', waiting: 'waiting', done: 'done', failed: 'failed', unknown: 'unknown',
}
const SHORT_WORD: Record<RowStatus, string> = { running: 'run', waiting: 'wait', done: 'done', failed: 'fail', unknown: '?' }
/** Glyph and color codes, the same as the status line of the full card. */
const glyphOf = (status: RowStatus, spin: string): readonly [string, string] => {
  switch (status) {
    case 'running': return [spin, 'c']
    case 'waiting': return ['◔', 'y']
    case 'done': return ['✓', 'g']
    case 'failed': return ['✗', 'rB']
    case 'unknown': return ['?', 'd']
    default: { const unreachable: never = status; return unreachable }
  }
}

/** Draws a three-row card (type and glyph, `<status> <time>`, border) and returns its height. */
export const drawCompactCard = (
  canvas: Canvas, x: number, y: number, width: number, row: Row, opts: CompactCardOpts,
): number => {
  const cardWidth = Math.max(width, MIN_CARD_WIDTH)
  const borderCodes = STATUS_CODE[row.st]
  const bottom = y + COMPACT_CARD_HEIGHT - 1
  for (let i = 1; i < cardWidth - 1; i++) {
    canvas.put(x + i, y, '─', borderCodes)
    canvas.put(x + i, bottom, '─', borderCodes)
  }
  canvas.put(x, y, '╭', borderCodes)
  canvas.put(x + cardWidth - 1, y, '╮', borderCodes)
  canvas.put(x, bottom, '╰', borderCodes)
  canvas.put(x + cardWidth - 1, bottom, '╯', borderCodes)
  canvas.put(x, y + 1, '│', borderCodes)
  canvas.put(x + cardWidth - 1, y + 1, '│', borderCodes)

  const [glyph, glyphCodes] = glyphOf(row.st, opts.spin ?? SPIN[0])
  canvas.put(x + cardWidth - 3, y, glyph, glyphCodes)
  // Padding around the type only where there is room for it; the nested cards are the narrowest.
  const gap = cardWidth >= ROOMY_CARD_WIDTH ? ' ' : ''
  canvas.text(x + 1, y, gap + fitNoPad(row.task || row.name, cardWidth - 5 - 2 * gap.length) + gap, 'B')

  const isStuck = !!row.stuck && row.st === 'running'
  const time = fmtT(row.secs) + (isStuck ? '!' : '')
  // Longest wording that fits, first with a space of padding inside each border, then flush to it.
  const fits = (text: string, inner: number): boolean => text.length + 1 + time.length <= inner
  const word = [2, 1].flatMap(pad => [STATUS_WORD[row.st], SHORT_WORD[row.st]].map(each => [each, pad] as const))
    .find(([each, pad]) => fits(each, cardWidth - 2 * pad)) ?? [SHORT_WORD[row.st], 1] as const
  const [text, pad] = word
  const inner = cardWidth - 2 * pad
  const room = inner - time.length - 1
  if (room > 1) canvas.text(x + pad, y + 1, fitNoPad(text, room), glyphCodes)
  // A time wider than the card is cut at the left edge of the text, never over the border.
  canvas.text(x + pad + Math.max(0, inner - time.length), y + 1, time, isStuck ? 'y' : 'd')
  return COMPACT_CARD_HEIGHT
}
