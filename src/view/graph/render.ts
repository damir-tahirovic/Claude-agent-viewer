// Graph view entry point. A typed port of `graph` and `asc` in docs/design/graph-generator.js.
import type { Row } from '../rows'
import type { Plan } from '../../core/progress'
import { frameGraph, graphTotals } from './frame'
import { flattenGraph, layoutNarrow, layoutWide } from './layout'
import type { GraphNode } from './layout'

export type GraphOpts = {
  readonly width: number
  readonly tree: GraphNode
  readonly selectedId?: string
  readonly plan?: Plan | null
  readonly sessionId?: string
  readonly ended?: string
  readonly note?: ReadonlyArray<readonly [string, string]>
  readonly middle?: string
  readonly hints?: ReadonlyArray<readonly [string, string]>
  readonly ascii?: boolean
  readonly columns?: number
  readonly firstColumn?: number
  readonly waitingText?: string
  readonly spin?: string
  readonly hasToggle?: boolean
}

/** Width from which cards show the input/output token split and the main card is wider. */
const RICH_WIDTH = 140

/** Swaps every graph glyph for one ASCII character. (graph spec `asc`) */
export const graphAscii = (line: string): string =>
  line
    .replace(/[╭╮╰╯├┤┬┴┼└┣┗╔╗╚╝]/g, '+').replace(/[│║]/g, '|').replace(/[─]/g, '-')
    .replace(/[━═]/g, '=')
    .replace(/┃/g, '#').replace(/┆/g, ':').replace(/╌/g, '.').replace(/▸/g, '>').replace(/⠋/g, '*')
    .replace(/◔/g, '!').replace(/✓/g, '+').replace(/✗/g, 'x').replace(/█/g, '#').replace(/░/g, '-')
    .replace(/…/g, '~').replace(/·/g, '.').replace(/●/g, '*').replace(/▲/g, '^')
    .replace(/[↑◂]/g, '^')
    .replace(/↓/g, 'v').replace(/—/g, '-').replace(/[←]/g, '<').replace(/[→]/g, '>')

/** Renders the side-by-side graph as `{codes|text}` lines. (graph spec `graph`) */
export const renderGraph = (opts: GraphOpts): string[] => {
  const nodes = flattenGraph(opts.tree)
  const rows = nodes.map(node => node.row)
  const isRich = opts.width >= RICH_WIDTH
  const lines = frameGraph(opts.width, { ...opts, rows }, canvas =>
    layoutWide(canvas, opts.tree, {
      ...opts,
      mainWidth: isRich ? 80 : 60,
      sessionCost: graphTotals(rows).cost,
      costedAgents: graphTotals(rows).costed,
      isRich,
    }))
  return opts.ascii ? lines.map(graphAscii) : lines
}

export type NarrowGraphOpts = Omit<GraphOpts, 'tree' | 'columns' | 'firstColumn' | 'middle'> & {
  readonly rows: ReadonlyArray<Row>
}

/** Renders the folded graph for narrow terminals: tree list, selected row as card. (graph spec `compact`) */
export const renderGraphNarrow = (opts: NarrowGraphOpts): string[] => {
  const lines = frameGraph(opts.width, opts, canvas =>
    layoutNarrow(canvas, opts.rows, {
      ...opts, sessionCost: graphTotals(opts.rows).cost, costedAgents: graphTotals(opts.rows).costed,
    }))
  return opts.ascii ? lines.map(graphAscii) : lines
}
