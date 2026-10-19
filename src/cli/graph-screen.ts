// The CLI's full-screen graph: the plugin's graph lines under a title line and above a footer line.
import type { SessionState } from '../core/model'
import { MAIN } from '../core/model'
import { planOf } from '../core/progress'
import { buildGraphLines, graphColumnsFor, panColumn } from '../view/graph/pane'
import type { GraphColumns, GraphDensity } from '../view/graph/pane'
import { clipLine, colorize, dim } from '../view/lines'
import type { Row } from '../view/rows'

const SESSION_ID_LENGTH = 8
/** Lines the screen adds around the graph: the title and the footer. */
const CHROME_LINES = 2
const HINTS: ReadonlyArray<readonly [string, string]> = [
  ['↑↓', 'select'], ['⏎', 'details'], ['tab', 'tree'], ['esc', 'sessions'], ['q', 'quit'],
]
const SCROLL_HINT: readonly [string, string] = ['←→', 'scroll']

export type GraphScreenOpts = {
  readonly state: SessionState
  readonly rows: ReadonlyArray<Row>
  readonly selectedId: string
  readonly graphCol: number
  readonly density: GraphDensity
  readonly columns: number
  readonly screenRows: number
  /** Project path shown in the title, already shortened; absent when unknown. */
  readonly path?: string
  readonly spin: string
  readonly ascii: boolean
}

/** Worker columns hidden at `columns`, as the pan keys need them; undefined when all show or it is narrow. */
export const hiddenColumnsOf = (
  rows: ReadonlyArray<{ readonly d: number }>,
  columns: number,
  density: GraphDensity,
): { readonly total: number; readonly visible: number } | undefined => {
  const shown = graphColumnsFor(rows, columns, density)
  return shown ? { total: rows.filter(row => row.d === 1).length, visible: shown.visible } : undefined
}

/** The first worker column after panning by `offset`; unchanged when no column is hidden. */
export const panGraph = (
  rows: ReadonlyArray<{ readonly d: number }>,
  columns: number,
  density: GraphDensity,
  graphCol: number,
  offset: number,
): number => {
  const hidden = hiddenColumnsOf(rows, columns, density)
  return hidden ? panColumn(graphCol, offset, { ...hidden, first: graphCol }) : graphCol
}

/** Footer hints, with the scroll hint only while worker columns are hidden. */
const footer = (columns: GraphColumns | undefined, density: GraphDensity): string => {
  const hints = [...HINTS.slice(0, -2), ['z', `density: ${density}`] as const, ...HINTS.slice(-2)]
  const keys = (columns ? [hints[0], SCROLL_HINT, ...hints.slice(1)] : hints)
    .map(([key, label]) => colorize('B', key) + dim(' ' + label)).join('  ')
  return columns ? `${keys}  ${dim(`◂ workers ${columns.first + 1}–${columns.first + columns.visible} of ${columns.total} ▸`)}` : keys
}

/** The graph screen as exactly `screenRows` lines, none wider than `columns`, plus the clamped first column. */
export const renderGraphScreen = (opts: GraphScreenOpts): { lines: string[]; graphCol: number } => {
  const { state, columns, screenRows } = opts
  const graph = buildGraphLines({
    rows: opts.rows, selectedId: opts.selectedId, graphCol: opts.graphCol, density: opts.density, plan: planOf(state.todos[MAIN]),
    sessionId: state.sessionId.slice(0, SESSION_ID_LENGTH), spin: opts.spin, columns, paneRows: screenRows,
    chromeLines: CHROME_LINES, ascii: opts.ascii, billing: { kind: 'unknown' },
  })
  const title = colorize('B', 'agentview') + dim(' · session ') + state.sessionId.slice(0, SESSION_ID_LENGTH) +
    (opts.path ? dim(' · ') + opts.path : '')
  const body = [title, ...graph.lines].slice(0, screenRows - 1)
  const lines = Array.from({ length: screenRows }, (_, index) =>
    clipLine(index === screenRows - 1 ? footer(graph.hiddenColumns, opts.density) : body[index] ?? '', columns))
  return { lines, graphCol: graph.hiddenColumns?.first ?? 0 }
}
