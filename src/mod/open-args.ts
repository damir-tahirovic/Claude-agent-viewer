import { paneRowsFor } from './pane-view'

/** The part of the engine's CommandPresentation that decides where the pane goes. */
export type OpenPresentation = { readonly isFullscreen: boolean; readonly columns: number }

/** Rows asked for inline above the prompt at most; the engine still caps it to the room the layout spares. */
const MAX_INLINE_ROWS = 30

/** Size request for `ui.open` (a missing presentation, as in the test kit, counts as the main screen): the full terminal width when docked in fullscreen, else the rows the content needs. */
export const openArgsFor = (
  presentation: OpenPresentation | undefined,
  agentCount: number,
): { readonly columns?: number; readonly rows?: number } =>
  presentation?.isFullscreen
    ? { columns: presentation.columns }
    : { rows: Math.min(MAX_INLINE_ROWS, paneRowsFor(agentCount)) }
