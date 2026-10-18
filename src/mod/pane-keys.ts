// Pure key decisions for the pane: what Esc does and where prev/next lands.

/** What a close request does: step back to the tree, close for real, or leave it to other hooks. */
export type CloseDecision = 'back' | 'close' | 'pass'

/** Esc in the detail view goes back; any other close of our pane really closes; other panes pass. */
export const decideClose = (view: 'tree' | 'detail', isOurPane: boolean, isPerson: boolean): CloseDecision => {
  if (!isOurPane) return 'pass'
  return isPerson && view === 'detail' ? 'back' : 'close'
}

/** The agent id `offset` steps from `current` in the visible order, wrapping; unknown current counts as first. */
export const stepId = (order: ReadonlyArray<string>, current: string, offset: number): string => {
  if (order.length === 0) return current
  const at = Math.max(0, order.indexOf(current))
  return order[(at + offset % order.length + order.length) % order.length]
}

/**
 * The visible window of rows after focus lands on `focusedId`: it moves by one when the focus is on its
 * first or last row and more rows lie beyond, so the arrows can walk past the edge. All rows fit: no window.
 */
export const nextWindow = (
  order: ReadonlyArray<string>,
  focusedId: string,
  win: readonly [number, number],
  room: number,
): [number, number] => {
  const total = order.length
  if (total <= room) return [0, total]
  const start = Math.min(Math.max(0, win[0]), total - room)
  const at = order.indexOf(focusedId)
  const placed = (first: number): [number, number] => {
    const clamped = Math.min(Math.max(0, first), total - room)
    return [clamped, clamped + room]
  }
  if (at < 0) return placed(start)
  if (at < start) return placed(at)
  if (at >= start + room) return placed(at - room + 1)
  if (at === start && start > 0) return placed(start - 1)
  if (at === start + room - 1 && start + room < total) return placed(start + 1)
  return placed(start)
}
