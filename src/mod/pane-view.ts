// Pane content as coded lines: the tree dialog or one agent's detail, without the host's own frame.
import { activeOnly, type AgentFilter } from '../core/active'
import { costSlot, showsCost } from '../core/billing'
import { fmtCost, fmtK } from '../core/format'
import type { SessionState } from '../core/model'
import { planOf, progressOf, progressPercent } from '../core/progress'
import { renderDetail, statusBadge } from '../view/detail'
import { renderDialog, windowFor } from '../view/dialog'
import { clipLine, colorize, dim, fitText, SPIN, toPlainAscii, visibleLength } from '../view/lines'
import { buildRows } from '../view/rows'
import { buildGraphLines } from './graph-pane'
import type { GraphColumns, GraphDensity } from './graph-pane'

/** Inputs for one pane render. */
export type PaneViewOpts = {
  readonly session: SessionState
  readonly view: 'tree' | 'detail'
  /** Which list the tree view shows: the table or the graph. */
  readonly mode?: 'tree' | 'graph'
  /** First visible worker column of a wide graph. */
  readonly graphCol?: number
  /** Card density of the graph; absent means auto. */
  readonly density?: GraphDensity
  /** Which agents the tree and graph list; absent means all. The detail and the header totals ignore it. */
  readonly filter?: AgentFilter
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
  /** Whether the view toggle shares the header's row; otherwise it takes a row of its own. */
  readonly isToggleBeside: boolean
  /** Depth of every agent in order, for panning the graph to the selection. */
  readonly outline: ReadonlyArray<{ readonly id: string; readonly d: number }>
  /** Worker columns of the graph when some are hidden; the pan Buttons need them. */
  readonly hiddenColumns?: GraphColumns
  /** Agents the active filter leaves out of the tree and graph; 0 under `all` and in the detail. */
  readonly hiddenCount: number
}

// Below 60 columns the dialog switches to its narrow mode; 50 is the narrowest width the hint and plan lines fit.
const MIN_TREE_COLUMNS = 50
const MIN_DETAIL_COLUMNS = 90
/** Lines of the dialog that are not agent rows: header, summary, rules, plan and hints, plus the filter Button row. */
const CHROME_ROWS = 11
const MIN_AGENT_ROWS = 3
const ASCII_SPIN = '*'
/** Footer hints without `q quit`: the pane is closed with esc, and q does nothing here. */
const TREE_HINTS: [string, string][] = [['↑↓', 'select'], ['⏎', 'details'], ['t/g', 'view'], ['esc', 'close']]
/** Below this width the hints plus `● live` do not fit with `t/g view`, so that hint is dropped. */
const MIN_FULL_HINT_COLUMNS = 54
const NARROW_TREE_HINTS = TREE_HINTS.filter(([key]) => key !== 't/g')
const DETAIL_HINTS: [string, string][] = [['◂ ▸', 'prev / next'], ['esc', 'back']]
const NO_SUBAGENTS_TEXT = '  ◌ no subagents yet — they appear here as soon as main delegates'

/** HH:MM:SS of an epoch-ms timestamp (UTC), the detail view's clock column. */
const clockOf = (ms: number): string => new Date(ms).toISOString().slice(11, 19)

/** How many agent rows fit in a pane of `paneRows` lines. */
export const roomFor = (paneRows: number, extraRows = 0): number =>
  Math.max(MIN_AGENT_ROWS, paneRows - CHROME_ROWS - extraRows)

/** Pane rows that show `agentCount` agents plus the chrome and the toggle row, for a pane that opens no taller than needed. */
export const paneRowsFor = (agentCount: number): number =>
  CHROME_ROWS + 1 + Math.max(MIN_AGENT_ROWS, agentCount)

/** Fewest detail lines kept when the pane is tiny. */
const MIN_DETAIL_ROWS = 4

/** Width of the `tree` and `graph` toggle Buttons side by side. */
const TOGGLE_WIDTH = 14
const TOGGLE_GAP = 2
/** Graph chrome besides the header: the hint line, the footer Buttons row and the filter Button row. */
const GRAPH_CHROME_ROWS = 4

/** Depth of every agent the tree and graph would list under `filter`, for panning to the selection after a toggle. */
export const outlineFor = (
  session: SessionState,
  filter: AgentFilter,
  now: number,
): ReadonlyArray<{ readonly id: string; readonly d: number }> =>
  buildRows(filter === 'active' ? activeOnly(session, now).state : session, now).map(row => ({ id: row.id, d: row.d }))

/** Builds the pane for the tree view or the detail of the selected agent. */
export const buildPaneView = (opts: PaneViewOpts): PaneView => {
  const { session, selId, now } = opts
  const allRows = buildRows(session, now)
  // The detail steps through every agent; the filter only narrows the tree and the graph.
  const filtered = opts.view === 'tree' && opts.filter === 'active' ? activeOnly(session, now) : undefined
  const rows = filtered ? buildRows(filtered.state, now) : allRows
  const hiddenCount = filtered?.hiddenCount ?? 0
  const order = rows.map(row => row.id)
  const outline = rows.map(row => ({ id: row.id, d: row.d }))
  const spin = opts.ascii ? ASCII_SPIN : SPIN[opts.spin % SPIN.length]
  const finish = (line: string): string => (opts.ascii ? toPlainAscii(line) : line)
  const sessionCost = allRows.reduce((sum, row) => sum + row.cost, 0)
  const sessionTokens = allRows.reduce((sum, row) => sum + row.i + row.o, 0)
  const selected = Math.max(0, rows.findIndex(row => row.id === selId))
  const agent = session.agents[rows[selected]?.id ?? '']

  if (opts.view === 'detail' && agent) {
    const parent = agent.parentId ? session.agents[agent.parentId] : undefined
    const costPart = showsCost(session.billing) ? fmtCost(rows[selected].cost) + ' · ' : ''
    const progress = progressOf(session.todos[agent.id])
    const progressPart = progress ? `progress ${progress.done}/${progress.total} (${progressPercent(progress)}%) · ` : ''
    const header = colorize('B', 'agentview') + dim(' › ') + colorize('B', agent.type) +
      dim(' · ' + costPart + progressPart) + colorize(...statusBadge(agent.status, spin))
    const lines = renderDetail({
      W: Math.max(opts.columns, MIN_DETAIL_COLUMNS), agent, parentName: parent?.type ?? '—',
      todos: session.todos[agent.id], now, clock: clockOf, cost: rows[selected].cost, sessionCost,
      spin, ascii: opts.ascii, frame: false, hints: DETAIL_HINTS, billing: session.billing,
    })
    // Below 90 columns the detail is cut, not reflowed; a narrow detail layout is not designed yet.
    const all = [header, ...lines].map(line => finish(clipLine(line, opts.columns)))
    // One row is left for the Button row below; a taller detail keeps its top and says how much is cut.
    const room = Math.max(MIN_DETAIL_ROWS, opts.rows - 1)
    const body = all.length <= room
      ? all
      : [...all.slice(0, room - 1), finish(clipLine(dim(`  … ${all.length - room + 1} more lines`), opts.columns))]
    return { order, outline, isToggleBeside: true, head: body, agentLines: [], tail: [], hiddenCount }
  }

  const plan = planOf(session.todos.main)
  const percent = plan ? Math.round(plan.done / plan.total * 100) + '%' : '—'
  const header = colorize('B', 'agentview') + dim(` · session ${session.sessionId.slice(0, 8)} · ` +
    `${fmtK(sessionTokens)} tok · ${costSlot(session.billing, sessionCost)} · plan `) + colorize('B', percent)

  const isToggleBeside = visibleLength(finish(header)) + TOGGLE_GAP + TOGGLE_WIDTH <= opts.columns
  const toggleRows = isToggleBeside ? 0 : 1

  if (opts.mode === 'graph') {
    const graph = buildGraphLines({
      rows, selectedId: rows[selected]?.id ?? 'main', graphCol: opts.graphCol ?? 0, density: opts.density, plan,
      sessionId: session.sessionId.slice(0, 8), spin, columns: opts.columns, paneRows: opts.rows,
      chromeLines: GRAPH_CHROME_ROWS + toggleRows, ascii: opts.ascii, billing: session.billing,
    })
    return {
      order, outline, isToggleBeside,
      head: [header, ...graph.lines].map(line => finish(clipLine(line, opts.columns))),
      agentLines: [],
      tail: [finish(clipLine(graph.hint, opts.columns))],
      hiddenColumns: graph.hiddenColumns,
      hiddenCount,
    }
  }

  const room = roomFor(opts.rows, toggleRows)
  // The stored window is clamped to valid bounds; windowFor then keeps the selection inside it.
  const storedStart = opts.win ? Math.min(Math.max(0, opts.win[0]), Math.max(0, rows.length - room)) : undefined
  const stored: [number, number] | undefined = storedStart === undefined ? undefined : [storedStart, storedStart + room]
  const win = rows.length > room ? windowFor(rows.length, selected, room, stored) : undefined
  const width = Math.max(opts.columns, MIN_TREE_COLUMNS)
  const lines = renderDialog({
    W: width, agents: rows, sel: selected,
    sid: session.sessionId.slice(0, 8), plan, win, spin, billing: session.billing, ascii: opts.ascii, frame: false, hints: width >= MIN_FULL_HINT_COLUMNS ? TREE_HINTS : NARROW_TREE_HINTS,
    after: rows.length === 1 ? [dim(fitText(NO_SUBAGENTS_TEXT, width - 4).trimEnd())] : undefined,
  })
  const [first, last] = win ?? [0, rows.length]
  // Frameless layout: summary, rule and column heads, then an optional "more above" line.
  const firstRowLine = 3 + (win && first > 0 ? 1 : 0)
  return {
    order, outline, isToggleBeside,
    head: [header, ...lines.slice(0, firstRowLine)].map(finish),
    agentLines: rows.slice(first, last).map((row, offset) => ({ id: row.id, line: finish(lines[firstRowLine + offset]) })),
    tail: lines.slice(firstRowLine + (last - first)).map(finish),
    hiddenCount,
  }
}
