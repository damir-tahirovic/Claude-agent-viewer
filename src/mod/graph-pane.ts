// The graph view as pane lines: the renderer's framed screen, made frameless and fitted to the pane.
import type { Plan } from '../core/progress'
import { colorize, dim, sliceColumns } from '../view/lines'
import { buildGraphTree, flattenGraph } from '../view/graph/layout'
import type { GraphNode } from '../view/graph/layout'
import { renderGraph, renderGraphNarrow } from '../view/graph/render'
import type { Row } from '../view/rows'

/** Below this many body columns the graph folds into the tree plus one expanded card. */
export const GRAPH_WIDE_COLUMNS = 110
/** Columns one worker card needs; fewer fit, the rest are panned. */
const WORKER_COLUMN_WIDTH = 40
/** The frame's two border columns, which the pane drops. */
const BORDER_COLUMNS = 2
/** Lines the frame adds below the body: rule, hints and bottom border. */
const FOOTER_FRAME_LINES = 3
/** Lines the pane adds around the graph: its header and the hint line. */
const PANE_CHROME_LINES = 2
const WAITING_TEXT = '◔ waiting'
const GRAPH_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['◂ ▸', 'select'], ['⏎', 'details'], ['t/g', 'view'], ['esc', 'close'],
]

/** Worker columns of a wide graph: how many exist, how many show and which one is first. */
export type GraphColumns = { readonly total: number; readonly visible: number; readonly first: number }

/** The graph as pane lines, plus the column state the pan Buttons need (absent when all columns show). */
export type GraphLines = {
  readonly lines: ReadonlyArray<string>
  readonly hint: string
  readonly hiddenColumns?: GraphColumns
}

export type GraphLinesOpts = {
  readonly rows: ReadonlyArray<Row>
  readonly selectedId: string
  readonly graphCol: number
  readonly plan: Plan | null
  readonly sessionId: string
  readonly spin: string
  readonly columns: number
  /** Viewport rows of the pane, header and hint line included. */
  readonly paneRows: number
  readonly ascii: boolean
}

/** Moves the first visible worker column by `offset`, clamped to the columns that exist. */
export const panColumn = (current: number, offset: number, columns: GraphColumns): number =>
  Math.min(Math.max(0, current + offset), Math.max(0, columns.total - columns.visible))

/** Drops the frame: top and bottom borders, the rule and hints, and the first and last column. */
const deframe = (lines: ReadonlyArray<string>, width: number): string[] =>
  lines.slice(1, lines.length - FOOTER_FRAME_LINES).map(line => sliceColumns(line, 1, width - 1))

/** Ids of finished subtrees that may fold into a chip, outermost first, never the root or the selection. */
const foldableIds = (root: GraphNode, selectedId: string): string[] => {
  const isFinished = (node: GraphNode): boolean => node.row.st === 'done' && node.kids.every(isFinished)
  const walk = (node: GraphNode): string[] => {
    if (node !== root && isFinished(node) && !flattenGraph(node).some(inner => inner.row.id === selectedId)) {
      return [node.row.id]
    }
    return node.kids.flatMap(walk)
  }
  return walk(root)
}

/** Hint line under the graph: the real controls, then the worker range when columns are hidden. */
const hintLine = (middle: string | undefined): string => {
  const keys = GRAPH_HINTS.map(([key, label]) => colorize('B', key) + dim(' ' + label)).join('   ')
  return middle ? keys + '   ' + dim(middle) : keys
}

/** Renders the graph for a pane `columns` wide, collapsing finished subtrees until it fits `paneRows`. */
export const buildGraphLines = (opts: GraphLinesOpts): GraphLines => {
  const width = opts.columns + BORDER_COLUMNS
  const common = {
    width, selectedId: opts.selectedId, plan: opts.plan, sessionId: opts.sessionId, spin: opts.spin,
    waitingText: WAITING_TEXT, ascii: opts.ascii, hasToggle: false,
  }
  if (opts.columns < GRAPH_WIDE_COLUMNS) {
    return { lines: deframe(renderGraphNarrow({ ...common, rows: opts.rows }), width), hint: hintLine(undefined) }
  }
  const workers = opts.rows.filter(row => row.d === 1).length
  const visible = Math.max(1, Math.floor((width - 4) / WORKER_COLUMN_WIDTH))
  const hiddenColumns: GraphColumns | undefined = workers > visible
    ? { total: workers, visible, first: panColumn(opts.graphCol, 0, { total: workers, visible, first: 0 }) }
    : undefined
  const middle = hiddenColumns
    ? `◂ workers ${hiddenColumns.first + 1}–${hiddenColumns.first + visible} of ${workers} ▸`
    : undefined
  const draw = (collapsed: ReadonlySet<string>): string[] => deframe(renderGraph({
    ...common, tree: buildGraphTree(opts.rows, collapsed), middle,
    ...(hiddenColumns ? { columns: visible, firstColumn: hiddenColumns.first } : {}),
  }), width)
  const foldable = foldableIds(buildGraphTree(opts.rows), opts.selectedId)
  const collapsed = new Set<string>()
  let lines = draw(collapsed)
  for (const id of foldable) {
    if (lines.length + PANE_CHROME_LINES <= opts.paneRows) break
    collapsed.add(id)
    lines = draw(collapsed)
  }
  return { lines, hint: hintLine(middle), hiddenColumns }
}
