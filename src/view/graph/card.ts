// Agent card and collapsed chip. A typed port of `card` and `chip` in docs/design/graph-generator.js.
import { showsCost } from '../../core/billing'
import { isExpensive } from '../../core/cost'
import { fmtCost, fmtK, fmtT } from '../../core/format'
import type { Billing } from '../../core/model'
import type { Plan } from '../../core/progress'
import { fitNoPad, SPIN } from '../lines'
import type { Row } from '../rows'
import type { Canvas } from './canvas'
import { ACTION_CODE, STATUS_CODE } from './style'

export type CardOpts = {
  readonly isMain?: boolean
  readonly isSelected?: boolean
  readonly plan?: Plan | null
  readonly sessionCost: number
  /** Agents with a cost above zero; the share rule of the expensive mark needs at least two. */
  readonly costedAgents?: number
  readonly isRich?: boolean
  readonly waitingText?: string
  readonly error?: string
  /** Spinner frame shown for a running agent. */
  readonly spin?: string
  /** How the session is paid for; the cost segment shows only with API billing, the default. */
  readonly billing?: Billing
}

const SINGLE_FRAME = ['╭', '─', '╮', '│', '╰', '╯'] as const
const DOUBLE_FRAME = ['╔', '═', '╗', '║', '╚', '╝'] as const
const PLAN_BAR_WIDTH = 16

/** Status line text and its color codes. */
const statusLine = (row: Row, opts: CardOpts): readonly [string, string] => {
  switch (row.st) {
    case 'running': return [`${opts.spin ?? SPIN[0]} running`, 'c']
    case 'waiting': return [opts.waitingText ?? '◔ waiting for permission', 'y']
    case 'done': return ['✓ done · result returned', 'g']
    case 'failed': return ['✗ failed · ' + (opts.error ?? 'exit 1'), 'rB']
    case 'unknown': return ['? unknown', 'd']
    default: { const unreachable: never = row.st; return unreachable }
  }
}

/** Draws the plan progress row of the main card. */
const drawPlanRow = (
  canvas: Canvas, x: number, y: number, innerWidth: number, plan: Plan | null | undefined,
): void => {
  if (!plan) {
    canvas.text(x, y, 'plan ░░░░░░░░░░░░░░░░  —  no todo list', 'd')
    return
  }
  const filled = Math.round(plan.done / plan.total * PLAN_BAR_WIDTH)
  const percent = Math.round(plan.done / plan.total * 100) + '%'
  const isComplete = plan.done === plan.total
  let position = x
  const segment = (text: string, codes: string): void => {
    canvas.text(position, y, text, codes)
    position += [...text].length
  }
  segment('plan ', '')
  segment('█'.repeat(filled), isComplete ? 'g' : 'b')
  segment('░'.repeat(PLAN_BAR_WIDTH - filled), 'd')
  segment(` ${plan.done}/${plan.total} ${percent}  `, 'B')
  segment(isComplete ? '✓ ' : '▸ ', isComplete ? 'g' : 'c')
  segment(fitNoPad(plan.cur, innerWidth - (position - x) - 2), isComplete ? 'd' : '')
}

/** Draws one agent card and returns its height. (graph spec `card`) */
export const drawCard = (
  canvas: Canvas, x: number, y: number, width: number, row: Row, opts: CardOpts,
): number => {
  const borderCodes = opts.isMain && row.st === 'running' ? '' : STATUS_CODE[row.st]
  const frame = opts.isSelected ? DOUBLE_FRAME : SINGLE_FRAME
  const height = opts.isMain ? 7 : 6
  for (let i = 1; i < width - 1; i++) {
    canvas.put(x + i, y, frame[1], borderCodes)
    canvas.put(x + i, y + height - 1, frame[1], borderCodes)
  }
  canvas.put(x, y, frame[0], borderCodes)
  canvas.put(x + width - 1, y, frame[2], borderCodes)
  canvas.put(x, y + height - 1, frame[4], borderCodes)
  canvas.put(x + width - 1, y + height - 1, frame[5], borderCodes)
  for (let r = 1; r < height - 1; r++) {
    canvas.put(x, y + r, frame[3], borderCodes)
    canvas.put(x + width - 1, y + r, frame[3], borderCodes)
  }
  canvas.text(x + 2, y, ' ' + row.name + ' ', 'B')
  const model = ' ' + row.model + ' '
  canvas.text(x + width - 2 - [...model].length, y, model, 'd')

  const innerWidth = width - 4
  const innerX = x + 2
  const [status, statusCodes] = statusLine(row, opts)
  canvas.text(innerX, y + 1, status, statusCodes)
  const isStuck = !!row.stuck && row.st === 'running'
  const time = fmtT(row.secs) + (isStuck ? '!' : '')
  canvas.text(innerX + innerWidth - time.length, y + 1, time, isStuck ? 'y' : 'd')
  const progressText = row.prog && !opts.isMain ? ` · ${row.prog.done}/${row.prog.total}` : ''
  canvas.text(innerX, y + 2, fitNoPad(row.task, innerWidth), row.st === 'done' ? 'd' : '')
  canvas.text(innerX, y + 3, fitNoPad('▸ ' + row.act, innerWidth), ACTION_CODE[row.st])

  const isCostly = isExpensive(row.cost, opts.sessionCost || 1.1, opts.costedAgents ?? 0)
  let position = innerX
  const segment = (text: string, codes: string): void => {
    canvas.text(position, y + 4, text, codes)
    position += [...text].length
  }
  const hasCost = showsCost(opts.billing)
  const tokenText = opts.isRich ? `in ${fmtK(row.i)} · out ${fmtK(row.o)}` : `${fmtK(row.i + row.o)} tok`
  segment(hasCost ? tokenText + ' · ' : tokenText, 'd')
  if (hasCost) segment(fmtCost(row.cost) + (isCostly ? '▲' : ''), isCostly ? 'yB' : 'd')
  segment(` · ${row.calls} calls`, 'd')
  if (progressText) {
    if (position - innerX + [...progressText].length <= innerWidth) segment(progressText, 'd')
    else {
      // The tokens line is full: the status line has room between the state and the time.
      const statusEnd = innerX + [...status].length
      const timeStart = innerX + innerWidth - time.length
      if (statusEnd + [...progressText].length < timeStart) canvas.text(statusEnd, y + 1, progressText, 'd')
    }
  }
  if (opts.isMain) drawPlanRow(canvas, innerX, y + 5, innerWidth, opts.plan)
  return height
}

/** Draws the one-line chip of a collapsed finished subtree and returns its height. (graph spec `chip`) */
export const drawChip = (
  canvas: Canvas, x: number, y: number, width: number, row: Row, hiddenCount: number,
): number => {
  for (let i = 1; i < width - 1; i++) {
    canvas.put(x + i, y, '─', 'd')
    canvas.put(x + i, y + 2, '─', 'd')
  }
  canvas.put(x, y, '╭', 'd')
  canvas.put(x + width - 1, y, '╮', 'd')
  canvas.put(x, y + 2, '╰', 'd')
  canvas.put(x + width - 1, y + 2, '╯', 'd')
  canvas.put(x, y + 1, '│', 'd')
  canvas.put(x + width - 1, y + 1, '│', 'd')
  canvas.runs(x + 2, y + 1, [
    ['✓ ', 'g'],
    [fitNoPad(`${row.name} · ${row.task}`, width - 14), 'd'],
    [` +${hiddenCount} done`, 'd'],
  ])
  return 3
}
