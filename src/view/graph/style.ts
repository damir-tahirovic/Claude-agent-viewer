// Per-status styling shared by cards, edges and the narrow list. Tables from docs/design/graph-generator.js.
import type { RowStatus } from '../rows'

/** Color code of a status: border, glyph and text accents. (graph spec `SC`) */
export const STATUS_CODE: Record<RowStatus, string> = {
  running: 'c', waiting: 'y', done: 'd', failed: 'r', unknown: 'd',
}

/** Vertical edge glyph: heavy running/failed, dashed waiting, light done. (graph spec `EV`) */
export const EDGE_VERTICAL: Record<RowStatus, string> = {
  running: '┃', waiting: '┆', done: '│', failed: '┃', unknown: '│',
}

/** Color code of an edge. (graph spec `EC`) */
export const EDGE_CODE: Record<RowStatus, string> = {
  running: 'c', waiting: 'y', done: 'd', failed: 'r', unknown: 'd',
}

/** Branch glyphs `[middle child, last child, horizontal stub]`. (graph spec `HJ`) */
export const EDGE_JOINT: Record<RowStatus, readonly [string, string, string]> = {
  running: ['┣', '┗', '━'],
  waiting: ['├', '└', '┄'],
  done: ['├', '└', '─'],
  failed: ['┣', '┗', '━'],
  unknown: ['├', '└', '─'],
}

/** Color code of the current-action line. */
export const ACTION_CODE: Record<RowStatus, string> = {
  running: '', waiting: 'y', done: 'd', failed: 'r', unknown: 'd',
}
