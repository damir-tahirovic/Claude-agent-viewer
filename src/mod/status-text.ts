// The status line text for a session: pure, so hooks only compare it with the last text sent.
import type { SessionState } from '../core/model'
import { planOf } from '../core/progress'
import { buildRows } from '../view/rows'
import { statusLine } from '../view/status'

/** Attention-first status line for the session at time `now`. */
export const statusFor = (state: SessionState, now: number): string =>
  statusLine(buildRows(state, now), planOf(state.todos.main), {}, state.billing)
