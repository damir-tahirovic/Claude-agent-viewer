// The graph view as pane lines: the renderer's framed screen, made frameless and fitted to the pane.
import type { Billing } from '../../core/model'
import type { Plan } from '../../core/progress'
import { colorize, dim, fitNoPad, sliceColumns } from '../lines'
import { buildGraphTree, flattenGraph } from './layout'
import type { GraphNode } from './layout'
import { renderGraph, renderGraphNarrow } from './render'
import type { Row } from '../rows'

/** Below this many body columns the graph folds into the tree plus one expanded card. */
export const GRAPH_WIDE_COLUMNS = 110
/** Columns one worker card needs; fewer fit, the rest are panned. */
const WORKER_COLUMN_WIDTH = 40
/** Narrowest column of a compact worker card. */
const COMPACT_COLUMN_WIDTH = 14

/** Card density the user asked for; `auto` picks full or compact from what fits. */
export type GraphDensity = 'auto' | 'full' | 'compact'
/** Next density of the `z` key: auto, full, compact, auto. */
export const nextDensity = (current: GraphDensity): GraphDensity =>
  current === 'auto' ? 'full' : current === 'full' ? 'compact' : 'auto'
/** The frame's two border columns, which the pane drops. */
const BORDER_COLUMNS = 2
/** Lines the frame adds below the body: rule, hints and bottom border. */
const FOOTER_FRAME_LINES = 3
const WAITING_TEXT = '◔ waiting'
const GRAPH_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['p/n', 'select'], ['d', 'details'], ['t/g', 'view'], ['z', 'density'], ['esc', 'close'],
]
const COLUMN_HINT: readonly [string, string] = ['h/l', 'columns']

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
  /** Viewport rows of the pane. */
  readonly paneRows: number
  /** Rows the pane adds around the graph: header, hint line, footer Buttons and a separate toggle row. */
  readonly chromeLines: number
  readonly ascii: boolean
  readonly billing?: Billing
  readonly density?: GraphDensity
}

/**
 * How many worker columns the wide graph shows at `bodyColumns`, or undefined when it is narrow or every
 * worker fits. Independent of the current view, so a toggle can pan to the selection before the graph draws.
 */
export const graphColumnsFor = (
  rows: ReadonlyArray<{ readonly d: number }>,
  bodyColumns: number,
  density: GraphDensity = 'auto',
): { readonly visible: number } | undefined => {
  if (bodyColumns < GRAPH_WIDE_COLUMNS) return undefined
  const workers = rows.filter(row => row.d === 1).length
  // Auto turns compact as soon as full cards would pan, so only 14-wide columns can hide workers there.
  const available = bodyColumns + BORDER_COLUMNS - 4
  // Compact keeps one full-width column back for the selected agent.
  const visible = Math.max(1, density === 'full'
    ? Math.floor(available / WORKER_COLUMN_WIDTH)
    : Math.floor((available - WORKER_COLUMN_WIDTH) / COMPACT_COLUMN_WIDTH) + 1)
  return workers > visible ? { visible } : undefined
}

/** Moves the first visible worker column by `offset`, clamped to the columns that exist. */
export const panColumn = (current: number, offset: number, columns: GraphColumns): number =>
  Math.min(Math.max(0, current + offset), Math.max(0, columns.total - columns.visible))

/**
 * The first worker column after the selection moves to `selectedId`: unchanged when it is visible (or main),
 * else the smallest move that shows the selected agent's worker column.
 */
export const panToInclude = (
  outline: ReadonlyArray<{ readonly id: string; readonly d: number }>,
  selectedId: string,
  graphCol: number,
  visible: number,
): number => {
  let workerIndex = -1
  for (const entry of outline) {
    if (entry.d === 1) workerIndex += 1
    if (entry.id !== selectedId) continue
    if (entry.d === 0 || workerIndex < 0) return graphCol
    if (workerIndex < graphCol) return workerIndex
    return workerIndex >= graphCol + visible ? workerIndex - visible + 1 : graphCol
  }
  return graphCol
}

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
  const keys = (middle ? [...GRAPH_HINTS, COLUMN_HINT] : GRAPH_HINTS).map(([key, label]) => colorize('B', key) + dim(' ' + label)).join('   ')
  return middle ? keys + '   ' + dim(middle) : keys
}

/** Cuts the body to the lines the pane has room for; the last kept line then says how many were cut. */
const clipToPane = (lines: string[], opts: GraphLinesOpts): string[] => {
  const room = Math.max(1, opts.paneRows - opts.chromeLines)
  if (lines.length <= room) return lines
  const kept = lines.slice(0, room - 1)
  return [...kept, dim(fitNoPad(`  ↓ ${lines.length - kept.length} more lines`, opts.columns))]
}

/** Renders the graph for a pane `columns` wide, collapsing finished subtrees until it fits `paneRows`. */
export const buildGraphLines = (opts: GraphLinesOpts): GraphLines => {
  const width = opts.columns + BORDER_COLUMNS
  const common = {
    width, selectedId: opts.selectedId, plan: opts.plan, sessionId: opts.sessionId, spin: opts.spin,
    waitingText: WAITING_TEXT, ascii: opts.ascii, hasToggle: false, billing: opts.billing,
  }
  if (opts.columns < GRAPH_WIDE_COLUMNS) {
    const narrow = deframe(renderGraphNarrow({ ...common, rows: opts.rows }), width)
    return { lines: clipToPane(narrow, opts), hint: hintLine(undefined) }
  }
  const workers = opts.rows.filter(row => row.d === 1).length
  const requested = opts.density ?? 'auto'
  // Auto: full while the columns and the height fit, else compact (below).
  const fullFits = graphColumnsFor(opts.rows, opts.columns, 'full') === undefined
  const tryFull = (): string[] => deframe(renderGraph({
    ...common, tree: buildGraphTree(opts.rows), density: 'full',
  }), width)
  const isCompact = requested === 'compact' ||
    (requested === 'auto' && !(fullFits && tryFull().length + opts.chromeLines <= opts.paneRows))
  const density = isCompact ? 'compact' : 'full'
  const visible = graphColumnsFor(opts.rows, opts.columns, density)?.visible ?? workers
  const hiddenColumns: GraphColumns | undefined = visible < workers
    ? { total: workers, visible, first: panColumn(opts.graphCol, 0, { total: workers, visible, first: 0 }) }
    : undefined
  const middle = hiddenColumns
    ? `◂ workers ${hiddenColumns.first + 1}–${hiddenColumns.first + visible} of ${workers} ▸`
    : undefined
  const draw = (collapsed: ReadonlySet<string>): string[] => deframe(renderGraph({
    ...common, tree: buildGraphTree(opts.rows, collapsed), middle, density,
    ...(hiddenColumns ? { columns: visible, firstColumn: hiddenColumns.first } : {}),
  }), width)
  const foldable = foldableIds(buildGraphTree(opts.rows), opts.selectedId)
  const collapsed = new Set<string>()
  let lines = draw(collapsed)
  for (const id of foldable) {
    if (lines.length + opts.chromeLines <= opts.paneRows) break
    collapsed.add(id)
    lines = draw(collapsed)
  }
  return { lines: clipToPane(lines, opts), hint: hintLine(middle), hiddenColumns }
}
