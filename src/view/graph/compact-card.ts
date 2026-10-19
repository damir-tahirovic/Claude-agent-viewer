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
  const isStuck = !!row.stuck && row.st === 'running'
  const time = fmtT(row.secs) + (isStuck ? '!' : '')
  // Glyph and time sit on the border, set off by spaces while the card is wide enough for them.
  const gap = 3 + time.length + 4 <= cardWidth ? ' ' : ''
  canvas.put(x + 1 + gap.length, y, glyph, glyphCodes)
  if (gap) {
    canvas.put(x + 1, y, ' ')
    canvas.put(x + 3, y, ' ')
    canvas.put(x + cardWidth - 2, y, ' ')
  }
  const timeStart = x + cardWidth - 1 - gap.length - time.length
  if (timeStart > x + 2 + gap.length) {
    canvas.text(timeStart, y, time, isStuck ? 'y' : 'd')
    if (gap) canvas.put(timeStart - 1, y, ' ')
  }
  // The task title takes the whole body row; it tells same-type agents apart.
  canvas.text(x + 1, y + 1, fitNoPad(row.task || row.name, cardWidth - 2), row.st === 'done' ? 'd' : '')
  return COMPACT_CARD_HEIGHT
}
