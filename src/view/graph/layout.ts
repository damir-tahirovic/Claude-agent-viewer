// Graph body layout. A typed port of `layoutH` in docs/design/graph-generator.js.
import type { Plan } from '../../core/progress'
import { fitNoPad, SPIN } from '../lines'
import { fmtT } from '../../core/format'
import type { Row } from '../rows'
import type { Canvas } from './canvas'
import { drawCard, drawChip } from './card'
import { EDGE_CODE, EDGE_JOINT, EDGE_VERTICAL, ACTION_CODE, STATUS_CODE } from './style'

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

type TreePrefix = {
  /** Branch drawing in front of the row, e.g. `│  ├─ `. */
  readonly text: string
  /** Per ancestor level: whether that level's trunk continues below this row. */
  readonly continues: ReadonlyArray<boolean>
  /** Whether this row has a later sibling. */
  readonly hasNextSibling: boolean
}

/** Whether row `index` has a later sibling before its parent's subtree ends. (graph spec `nxt`) */
const hasNextSibling = (rows: ReadonlyArray<Row>, index: number): boolean => {
  for (let j = index + 1; j < rows.length; j++) {
    if (rows[j].d < rows[index].d) return false
    if (rows[j].d === rows[index].d) return true
  }
  return false
}

/** Tree branch prefixes for rows in depth-first order. (graph spec `pre2`) */
const treePrefixes = (rows: ReadonlyArray<Row>): TreePrefix[] =>
  rows.map((row, index) => {
    if (!row.d) return { text: '', continues: [], hasNextSibling: false }
    const continues: boolean[] = []
    for (let depth = row.d - 1; depth >= 1; depth--) {
      let ancestor = index - 1
      while (rows[ancestor].d !== depth) ancestor--
      continues.unshift(hasNextSibling(rows, ancestor))
    }
    const trunks = continues.map(isOpen => (isOpen ? '│  ' : '   ')).join('')
    const isNext = hasNextSibling(rows, index)
    return { text: trunks + (isNext ? '├─ ' : '└─ '), continues, hasNextSibling: isNext }
  })

export type NarrowLayoutOpts = {
  readonly selectedId?: string
  readonly sessionCost: number
  readonly spin?: string
}

/** Draws the folded tree list with the selected row expanded as a card; returns the last row used. (graph spec `layoutV`) */
export const layoutNarrow = (canvas: Canvas, rows: ReadonlyArray<Row>, opts: NarrowLayoutOpts): number => {
  const width = canvas.width
  const spin = opts.spin ?? SPIN[0]
  const prefixes = treePrefixes(rows)
  const glyphs = { running: spin, waiting: '◔', done: '✓', failed: '✗', unknown: '?' }
  let y = 2
  rows.forEach((row, index) => {
    const prefix = prefixes[index]
    const prefixLength = [...prefix.text].length
    const left = 2
    const isSelected = opts.selectedId === row.id
    canvas.text(left, y, prefix.text, 'd')
    const startX = left + prefixLength
    const flex = width - 4 - prefixLength - 21
    const taskWidth = Math.floor(flex * 0.45)
    const actionWidth = flex - taskWidth
    const isStuck = !!row.stuck && row.st === 'running'
    const time = fmtT(row.secs) + (isStuck ? '!' : '')
    const statusCode = STATUS_CODE[row.st] === 'd' ? 'g' : STATUS_CODE[row.st]
    canvas.runs(startX, y, [
      [glyphs[row.st] + ' ', isSelected ? 'IB' : statusCode],
      [fitNoPad(row.name, 8).padEnd(9), isSelected ? 'IB' : row.d ? '' : 'B'],
      [fitNoPad(row.task, taskWidth).padEnd(taskWidth + 1), isSelected ? 'IB' : row.st === 'done' ? 'd' : ''],
      [fitNoPad(row.act, actionWidth).padEnd(actionWidth + 1), isSelected ? 'IB' : ACTION_CODE[row.st]],
      [time.padStart(6), isSelected ? 'IB' : isStuck ? 'y' : 'd'],
    ])
    prefix.continues.forEach((isOpen, level) => {
      if (isOpen) canvas.put(left + 3 * level, y, '│', 'd')
    })
    y++
    if (!isSelected) return
    const cardWidth = width - 2 - startX - 1
    prefix.continues.forEach((isOpen, level) => {
      if (isOpen) for (let r = 0; r < 6; r++) canvas.put(left + 3 * level, y + r, '│', 'd')
    })
    if (prefix.hasNextSibling) for (let r = 0; r < 6; r++) canvas.put(left + 3 * (row.d - 1), y + r, '│', 'd')
    drawCard(canvas, startX, y, cardWidth, row, {
      isSelected: true, sessionCost: opts.sessionCost, isRich: true, spin: opts.spin, error: row.err,
    })
    y += 6
  })
  return y - 1
}
