// Pane content as coded lines: the tree dialog or one agent's detail, without the host's own frame.
import { fmtCost, fmtK } from '../core/format'
import type { SessionState } from '../core/model'
import { planOf } from '../core/progress'
import { renderDetail, statusBadge } from '../view/detail'
import { renderDialog, windowFor } from '../view/dialog'
import { clipLine, colorize, dim, fitText, SPIN, toPlainAscii } from '../view/lines'
import { buildRows } from '../view/rows'
import { buildGraphLines } from './graph-pane'
import type { GraphColumns } from './graph-pane'

/** Inputs for one pane render. */
export type PaneViewOpts = {
  readonly session: SessionState
  readonly view: 'tree' | 'detail'
  /** Which list the tree view shows: the table or the graph. */
  readonly mode?: 'tree' | 'graph'
  /** First visible worker column of a wide graph. */
  readonly graphCol?: number
  readonly selId: string
  readonly spin: number
  readonly now: number
  readonly columns: number
  readonly rows: number
  readonly ascii: boolean
  /** Window of rows kept by the pane's focus hook; absent shows the selected row's neighbourhood. */
  readonly win?: readonly [number, number]
}

/** A pane split into lines around the selectable agent rows. */
export type PaneView = {
  /** Agent ids in the visible tree order, for prev/next. */
  readonly order: ReadonlyArray<string>
  readonly head: ReadonlyArray<string>
  readonly agentLines: ReadonlyArray<{ readonly id: string; readonly line: string }>
  readonly tail: ReadonlyArray<string>
  /** Worker columns of the graph when some are hidden; the pan Buttons need them. */
  readonly hiddenColumns?: GraphColumns
}

// Below 60 columns the dialog switches to its narrow mode; 50 is the narrowest width the hint and plan lines fit.
const MIN_TREE_COLUMNS = 50
const MIN_DETAIL_COLUMNS = 90
/** Lines of the dialog that are not agent rows: header, summary, rules, plan and hints. */
const CHROME_ROWS = 10
const MIN_AGENT_ROWS = 3
const ASCII_SPIN = '*'
/** Footer hints without `q quit`: the pane is closed with esc, and q does nothing here. */
const TREE_HINTS: [string, string][] = [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'close']]
const DETAIL_HINTS: [string, string][] = [['◂ ▸', 'prev / next'], ['esc', 'back']]
const NO_SUBAGENTS_TEXT = '  ◌ no subagents yet — they appear here as soon as main delegates'

/** HH:MM:SS of an epoch-ms timestamp (UTC), the detail view's clock column. */
const clockOf = (ms: number): string => new Date(ms).toISOString().slice(11, 19)

/** How many agent rows fit in a pane of `paneRows` lines. */
export const roomFor = (paneRows: number): number => Math.max(MIN_AGENT_ROWS, paneRows - CHROME_ROWS)

/** Builds the pane for the tree view or the detail of the selected agent. */
export const buildPaneView = (opts: PaneViewOpts): PaneView => {
  const { session, selId, now } = opts
  const rows = buildRows(session, now)
  const order = rows.map(row => row.id)
  const spin = opts.ascii ? ASCII_SPIN : SPIN[opts.spin % SPIN.length]
  const finish = (line: string): string => (opts.ascii ? toPlainAscii(line) : line)
  const sessionCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const sessionTokens = rows.reduce((sum, row) => sum + row.i + row.o, 0)
  const selected = Math.max(0, rows.findIndex(row => row.id === selId))
  const agent = session.agents[rows[selected]?.id ?? '']

  if (opts.view === 'detail' && agent) {
    const parent = agent.parentId ? session.agents[agent.parentId] : undefined
    const header = colorize('B', 'agentview') + dim(' › ') + colorize('B', agent.type) +
      dim(' · ' + fmtCost(rows[selected].cost) + ' · ') + colorize(...statusBadge(agent.status, spin))
    const lines = renderDetail({
      W: Math.max(opts.columns, MIN_DETAIL_COLUMNS), agent, parentName: parent?.type ?? '—',
      todos: session.todos[agent.id], now, clock: clockOf, cost: rows[selected].cost, sessionCost,
      spin, ascii: opts.ascii, frame: false, hints: DETAIL_HINTS,
    })
    // Below 90 columns the detail is cut, not reflowed; the narrow layout waits for Phase 1b.
    const body = [header, ...lines].map(line => finish(clipLine(line, opts.columns)))
    return { order, head: body, agentLines: [], tail: [] }
  }

  const plan = planOf(session.todos.main)
  const percent = plan ? Math.round(plan.done / plan.total * 100) + '%' : '—'
  const header = colorize('B', 'agentview') + dim(` · session ${session.sessionId.slice(0, 8)} · ` +
    `${fmtK(sessionTokens)} tok · ${fmtCost(sessionCost)} · plan `) + colorize('B', percent)

  if (opts.mode === 'graph') {
    const graph = buildGraphLines({
      rows, selectedId: rows[selected]?.id ?? 'main', graphCol: opts.graphCol ?? 0, plan,
      sessionId: session.sessionId.slice(0, 8), spin, columns: opts.columns, paneRows: opts.rows, ascii: opts.ascii,
    })
    return {
      order,
      head: [header, ...graph.lines].map(line => finish(clipLine(line, opts.columns))),
      agentLines: [],
      tail: [finish(clipLine(graph.hint, opts.columns))],
      hiddenColumns: graph.hiddenColumns,
    }
  }

  const room = roomFor(opts.rows)
  // The stored window is clamped to valid bounds; windowFor then keeps the selection inside it.
  const storedStart = opts.win ? Math.min(Math.max(0, opts.win[0]), Math.max(0, rows.length - room)) : undefined
  const stored: [number, number] | undefined = storedStart === undefined ? undefined : [storedStart, storedStart + room]
  const win = rows.length > room ? windowFor(rows.length, selected, room, stored) : undefined
  const width = Math.max(opts.columns, MIN_TREE_COLUMNS)
  const lines = renderDialog({
    W: width, agents: rows, sel: selected,
    sid: session.sessionId.slice(0, 8), plan, win, spin, ascii: opts.ascii, frame: false, hints: TREE_HINTS,
    after: rows.length === 1 ? [dim(fitText(NO_SUBAGENTS_TEXT, width - 4).trimEnd())] : undefined,
  })
  const [first, last] = win ?? [0, rows.length]
  // Frameless layout: summary, rule and column heads, then an optional "more above" line.
  const firstRowLine = 3 + (win && first > 0 ? 1 : 0)
  return {
    order,
    head: [header, ...lines.slice(0, firstRowLine)].map(finish),
    agentLines: rows.slice(first, last).map((row, offset) => ({ id: row.id, line: finish(lines[firstRowLine + offset]) })),
    tail: lines.slice(firstRowLine + (last - first)).map(finish),
  }
}
