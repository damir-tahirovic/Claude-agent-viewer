// Graph body layout. A typed port of `layoutH` in docs/design/graph-generator.js.
import type { Plan } from '../../core/progress'
import type { Row } from '../rows'
import type { Canvas } from './canvas'
import { drawCard, drawChip } from './card'
import { EDGE_CODE, EDGE_JOINT, EDGE_VERTICAL } from './style'

export type GraphNode = {
  readonly row: Row
  readonly kids: ReadonlyArray<GraphNode>
  /** A finished subtree drawn as a one-line chip. */
  readonly isCollapsed?: boolean
}

/** Builds the agent tree from rows in depth-first order with depth `d`. */
export const buildGraphTree = (rows: ReadonlyArray<Row>, collapsedIds: ReadonlySet<string> = new Set()): GraphNode => {
  type Draft = { row: Row; kids: Draft[] }
  const drafts: Draft[] = rows.map(row => ({ row, kids: [] }))
  const path: Draft[] = []
  drafts.forEach(draft => {
    path.length = draft.row.d
    if (draft.row.d > 0) path[draft.row.d - 1].kids.push(draft)
    path[draft.row.d] = draft
  })
  const freeze = (draft: Draft): GraphNode => ({
    row: draft.row,
    kids: draft.kids.map(freeze),
    ...(collapsedIds.has(draft.row.id) ? { isCollapsed: true } : {}),
  })
  return freeze(drafts[0])
}

/** Every node of the tree in depth-first order. (graph spec `flat`) */
export const flattenGraph = (node: GraphNode): GraphNode[] => [node, ...node.kids.flatMap(flattenGraph)]

export type WideLayoutOpts = {
  readonly mainWidth: number
  readonly plan?: Plan | null
  readonly selectedId?: string
  readonly sessionCost: number
  readonly isRich: boolean
  readonly columns?: number
  readonly firstColumn?: number
  readonly spin?: string
  readonly waitingText?: string
}

/** Draws main on top, children on a bus line and grandchildren under their parent; returns the last row used. (graph spec `layoutH`) */
export const layoutWide = (canvas: Canvas, root: GraphNode, opts: WideLayoutOpts): number => {
  const width = canvas.width
  const first = opts.firstColumn || 0
  const kids = root.kids.slice(first, first + (opts.columns || root.kids.length))
  const count = kids.length
  const columnWidth = Math.floor((width - 4) / Math.max(count, 1))
  const centers = kids.map((_, i) => 2 + columnWidth * i + Math.floor(columnWidth / 2))
  const mainCenter = count ? Math.floor((centers[0] + centers[count - 1]) / 2) : Math.floor(width / 2)
  const cardOpts = (node: GraphNode) => ({
    isSelected: opts.selectedId === node.row.id,
    sessionCost: opts.sessionCost,
    isRich: opts.isRich,
    spin: opts.spin,
    waitingText: opts.waitingText,
    error: node.row.err,
  })

  drawCard(canvas, mainCenter - Math.floor(opts.mainWidth / 2), 2, opts.mainWidth, root.row, {
    ...cardOpts(root), isMain: true, plan: opts.plan,
  })
  canvas.put(mainCenter, 8, '┬', 'd')
  if (!count) {
    for (const y of [9, 10]) canvas.put(mainCenter, y, '┆', 'd')
    canvas.text(mainCenter - 11, 11, '╌╌ no subagents yet ╌╌', 'd')
    canvas.text(mainCenter - 27, 12, 'they appear here the moment main delegates a task', 'd')
    return 12
  }
  canvas.put(mainCenter, 9, '│', 'd')
  canvas.text(mainCenter + 2, 9, 'spawn', 'd')
  if (count > 1) {
    for (let x = centers[0]; x <= centers[count - 1]; x++) canvas.put(x, 10, '─', 'd')
    canvas.put(centers[0], 10, '╭', 'd')
    canvas.put(centers[count - 1], 10, '╮', 'd')
    centers.slice(1, -1).forEach(center => canvas.put(center, 10, '┬', 'd'))
    canvas.put(mainCenter, 10, centers.includes(mainCenter) ? '┼' : '┴', 'd')
  } else {
    canvas.put(mainCenter, 10, '│', 'd')
  }

  let lastY = 12
  kids.forEach((kid, index) => {
    const row = kid.row
    const x = 2 + columnWidth * index + 1
    const cardWidth = columnWidth - 2
    const y = 12
    canvas.put(centers[index], 11, EDGE_VERTICAL[row.st], EDGE_CODE[row.st])
    const height = kid.isCollapsed
      ? drawChip(canvas, x, y, cardWidth, row, flattenGraph(kid).length - 1)
      : drawCard(canvas, x, y, cardWidth, row, cardOpts(kid))
    lastY = Math.max(lastY, y + height - 1)
    if (kid.isCollapsed || !kid.kids.length) return
    const trunk = x + 2
    canvas.put(trunk, y + height - 1, '┬', 'd')
    let grandY = y + height
    let from = y + height
    kid.kids.forEach((grand, j) => {
      const grandRow = grand.row
      const isLast = j === kid.kids.length - 1
      const crossing = grandY + 1
      for (let r = from; r < crossing; r++) canvas.put(trunk, r, EDGE_VERTICAL[grandRow.st], EDGE_CODE[grandRow.st])
      const joint = EDGE_JOINT[grandRow.st]
      canvas.put(trunk, crossing, isLast ? joint[1] : joint[0], EDGE_CODE[grandRow.st])
      canvas.put(trunk + 1, crossing, joint[2], EDGE_CODE[grandRow.st])
      const grandHeight = drawCard(canvas, trunk + 2, grandY, cardWidth - 4, grandRow, cardOpts(grand))
      from = crossing + 1
      grandY += grandHeight
      lastY = Math.max(lastY, grandY - 1)
    })
  })
  return lastY
}
