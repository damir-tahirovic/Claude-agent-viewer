import { paneRowsFor } from './pane-view'

/** The part of the engine's CommandPresentation that decides where the pane goes. */
export type OpenPresentation = { readonly isFullscreen: boolean; readonly columns: number }

/** Rows asked for inline above the prompt at most; the engine still caps it to the room the layout spares. */
const MAX_INLINE_ROWS = 40
/** Rows the tree view asks for at most; the tree needs one row per agent and no more. */
const MAX_TREE_ROWS = 30

/** Size request for `ui.open` (a missing presentation, as in the test kit, counts as the main screen): the full terminal width when docked in fullscreen, else the rows the content needs; the graph is tall, so it asks for the most. */
export const openArgsFor = (
  presentation: OpenPresentation | undefined,
  agentCount: number,
  mode: 'tree' | 'graph' = 'tree',
): { readonly columns?: number; readonly rows?: number } =>
  presentation?.isFullscreen
    ? { columns: presentation.columns }
    : { rows: mode === 'graph' ? MAX_INLINE_ROWS : Math.min(MAX_TREE_ROWS, paneRowsFor(agentCount)) }
