// Pane content as coded lines: the tree dialog or one agent's detail, without the host's own frame.
import { fmtCost, fmtK } from '../core/format'
import type { SessionState } from '../core/model'
import { planOf } from '../core/progress'
import { renderDetail } from '../view/detail'
import { renderDialog, windowFor } from '../view/dialog'
import { colorize, dim, SPIN } from '../view/lines'
import { buildRows } from '../view/rows'

/** Inputs for one pane render. */
export type PaneViewOpts = {
  readonly session: SessionState
  readonly view: 'tree' | 'detail'
  readonly selId: string
  readonly spin: number
  readonly now: number
  readonly columns: number
  readonly rows: number
  readonly ascii: boolean
}

/** A pane split into lines around the selectable agent rows. */
export type PaneView = {
  /** Agent ids in the visible tree order, for prev/next. */
  readonly order: ReadonlyArray<string>
  readonly head: ReadonlyArray<string>
  readonly agentLines: ReadonlyArray<{ readonly id: string; readonly line: string }>
  readonly tail: ReadonlyArray<string>
}

// Below 60 columns the dialog switches to its narrow mode; 50 is the narrowest width the hint and plan lines fit.
const MIN_TREE_COLUMNS = 50
const MIN_DETAIL_COLUMNS = 90
/** Lines of the dialog that are not agent rows: header, summary, rules, plan and hints. */
const CHROME_ROWS = 10
const MIN_AGENT_ROWS = 3
const NO_SUBAGENTS_LINE = dim('  ◌ no subagents yet — they appear here as soon as main delegates')
const NO_SUBAGENTS_NARROW = dim('  ◌ no subagents yet')

/** HH:MM:SS of an epoch-ms timestamp (UTC), the detail view's clock column. */
const clockOf = (ms: number): string => new Date(ms).toISOString().slice(11, 19)

/** Builds the pane for the tree view or the detail of the selected agent. */
export const buildPaneView = (opts: PaneViewOpts): PaneView => {
  const { session, selId, now } = opts
  const rows = buildRows(session, now)
  const order = rows.map(row => row.id)
  const spin = SPIN[opts.spin % SPIN.length]
  const sessionCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const sessionTokens = rows.reduce((sum, row) => sum + row.i + row.o, 0)
  const selected = Math.max(0, rows.findIndex(row => row.id === selId))
  const agent = session.agents[rows[selected]?.id ?? '']

  if (opts.view === 'detail' && agent) {
    const parent = agent.parentId ? session.agents[agent.parentId] : undefined
    const header = colorize('B', 'agentview') + dim(' › ') + colorize('B', agent.type) +
      dim(' · ' + fmtCost(rows[selected].cost))
    const lines = renderDetail({
      W: Math.max(opts.columns, MIN_DETAIL_COLUMNS), agent, parentName: parent?.type ?? '—',
      todos: session.todos[agent.id], now, clock: clockOf, cost: rows[selected].cost, sessionCost,
      spin, ascii: opts.ascii, frame: false,
    })
    return { order, head: [header, ...lines], agentLines: [], tail: [] }
  }

  const plan = planOf(session.todos.main)
  const room = Math.max(MIN_AGENT_ROWS, opts.rows - CHROME_ROWS)
  const win = rows.length > room ? windowFor(rows.length, selected, room) : undefined
  const lines = renderDialog({
    W: Math.max(opts.columns, MIN_TREE_COLUMNS), agents: rows, sel: selected,
    sid: session.sessionId.slice(0, 8), plan, win, spin, ascii: opts.ascii, frame: false,
    after: rows.length === 1 ? [opts.columns < 60 ? NO_SUBAGENTS_NARROW : NO_SUBAGENTS_LINE] : undefined,
  })
  const [first, last] = win ?? [0, rows.length]
  // Frameless layout: summary, rule and column heads, then an optional "more above" line.
  const firstRowLine = 3 + (win && first > 0 ? 1 : 0)
  const percent = plan ? Math.round(plan.done / plan.total * 100) + '%' : '—'
  const header = colorize('B', 'agentview') + dim(` · session ${session.sessionId.slice(0, 8)} · ` +
    `${fmtK(sessionTokens)} tok · ${fmtCost(sessionCost)} · plan `) + colorize('B', percent)
  return {
    order,
    head: [header, ...lines.slice(0, firstRowLine)],
    agentLines: rows.slice(first, last).map((row, offset) => ({ id: row.id, line: lines[firstRowLine + offset] })),
    tail: lines.slice(firstRowLine + (last - first)),
  }
}
