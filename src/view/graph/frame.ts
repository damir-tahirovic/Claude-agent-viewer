// Frame around the graph body. A typed port of `frame` and `totals` in docs/design/graph-generator.js.
import { costSlot } from '../../core/billing'
import { fmtK } from '../../core/format'
import type { Billing } from '../../core/model'
import type { Plan } from '../../core/progress'
import { SPIN } from '../lines'
import type { Row, RowStatus } from '../rows'
import { Canvas } from './canvas'

export type GraphTotals = Record<RowStatus, number> & { tok: number; isTokPartial: boolean; cost: number; n: number; costed: number }

/** Sums tokens, cost and per-status counts. (graph spec `totals`) */
export const graphTotals = (rows: ReadonlyArray<Row>): GraphTotals => {
  const totals: GraphTotals = {
    tok: 0, isTokPartial: false, cost: 0, running: 0, waiting: 0, done: 0, failed: 0, unknown: 0, n: rows.length, costed: 0,
  }
  rows.forEach(row => {
    totals.tok += row.i + row.o
    if (row.outputPartial) totals.isTokPartial = true
    totals.cost += row.cost
    if (row.cost > 0) totals.costed += 1
    totals[row.st] += 1
  })
  return totals
}

export type FrameOpts = {
  readonly rows: ReadonlyArray<Row>
  readonly plan?: Plan | null
  readonly sessionId?: string
  readonly ended?: string
  readonly note?: ReadonlyArray<readonly [string, string]>
  readonly middle?: string
  readonly hints?: ReadonlyArray<readonly [string, string]>
  readonly spin?: string
  /** How the session is paid for; the header shows cost only with API billing, the default. */
  readonly billing?: Billing
  /** Draw the spec's `tree  graph` toggle label in the summary row; the live pane has real Buttons instead. Default true. */
  readonly hasToggle?: boolean
}

/** Rows the canvas starts with; it grows when the body is taller. */
const INITIAL_ROWS = 100

const DEFAULT_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['←→↑↓', 'move'], ['⏎', 'details'], ['tab', 'tree'], ['esc', 'close'],
]

/** Draws `body` on a canvas and wraps it with header, summary, note, hints, borders. (graph spec `frame`) */
export const frameGraph = (width: number, opts: FrameOpts, body: (canvas: Canvas) => number): string[] => {
  const canvas = new Canvas(width, INITIAL_ROWS)
  const lastY = body(canvas)
  const totals = graphTotals(opts.rows)
  const noteRow = opts.note ? lastY + 2 : null
  const rule = (noteRow || lastY + 1) + 1
  const hintRow = rule + 1
  const bottom = hintRow + 1
  const height = bottom + 1
  for (let x = 1; x < width - 1; x++) {
    canvas.put(x, 0, '─', 'd')
    canvas.put(x, bottom, '─', 'd')
    canvas.put(x, rule, '─', 'd')
  }
  canvas.put(0, 0, '╭', 'd')
  canvas.put(width - 1, 0, '╮', 'd')
  canvas.put(0, bottom, '╰', 'd')
  canvas.put(width - 1, bottom, '╯', 'd')
  canvas.put(0, rule, '├', 'd')
  canvas.put(width - 1, rule, '┤', 'd')
  for (let r = 1; r < bottom; r++) {
    if (r === rule) continue
    canvas.put(0, r, '│', 'd')
    canvas.put(width - 1, r, '│', 'd')
  }
  const percent = opts.plan ? Math.round(opts.plan.done / opts.plan.total * 100) + '%' : '—'
  const rightText = `${fmtK(totals.tok)}${totals.isTokPartial ? '+' : ''} tok · ${costSlot(opts.billing, totals.cost)} · plan `
  const rightLength = [...rightText].length + [...percent].length
  canvas.runs(2, 0, [
    [' agentview', 'B'], [' · session ', 'd'], [opts.sessionId || '7f3a9c2e', ''], [' ', ''],
  ])
  canvas.runs(width - 3 - rightLength, 0, [[rightText, 'd'], [percent, 'B']])

  const spin = opts.spin ?? SPIN[0]
  const counts: ReadonlyArray<readonly [string, string, string, number]> = [
    ['c', spin, 'running', totals.running],
    ['y', '◔', 'waiting', totals.waiting],
    ['g', '✓', 'done', totals.done],
    ['r', '✗', 'failed', totals.failed],
  ]
  const summary: Array<readonly [string, string]> = opts.ended
    ? [['✓ session finished', 'g'], [` · ${totals.n} agents · ${opts.ended}`, 'd']]
    : [
        ...counts.flatMap(([codes, glyph, word, count], i): Array<readonly [string, string]> => [
          [i ? '   ' : '', ''],
          [`${glyph} ${count} ${word}`, count ? codes : 'd'],
        ]),
        [`   ·  ${totals.n} agents`, 'd'],
      ]
  canvas.runs(2, 1, summary)
  if (width >= 100 && opts.hasToggle !== false) canvas.runs(width - 3 - 13, 1, [['tree', 'd'], ['  ', ''], [' graph ', 'IB']])
  if (noteRow) canvas.runs(2, noteRow, opts.note ?? [])

  let position = 2
  ;(opts.hints ?? DEFAULT_HINTS).forEach(([key, label]) => {
    canvas.runs(position, hintRow, [[key, 'B'], [' ' + label, 'd']])
    position += [...key].length + 1 + [...label].length + 3
  })
  if (opts.middle) canvas.text(Math.floor(width / 2) - 8, hintRow, opts.middle, 'd')
  canvas.runs(width - 3 - 6, hintRow, opts.ended ? [['ended', 'd']] : [['●', 'g'], [' live', 'd']])
  return canvas.lines(height)
}
