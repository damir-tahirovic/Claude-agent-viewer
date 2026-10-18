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
