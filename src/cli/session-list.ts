// Session list model for the standalone CLI: turns session states into the rows `renderSessions` draws.
import { planOf } from '../core/progress'
import { MAIN, UNKNOWN_AFTER_MS, type SessionState } from '../core/model'
import { buildRows, type RowStatus } from '../view/rows'
import type { SessionListItem } from '../view/sessions'

const DASH = '—'
const SESSION_ID_LENGTH = 8

/** Compact age of a duration in ms: `2s`, `1m35s`, `38m`, `2h`, `1d`. */
export const fmtAgo = (elapsedMs: number): string => {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  if (seconds < 60) return seconds + 's'
  if (seconds < 600) return Math.floor(seconds / 60) + 'm' + String(seconds % 60).padStart(2, '0') + 's'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm'
  if (seconds < 86_400) return Math.floor(seconds / 3600) + 'h'
  return Math.floor(seconds / 86_400) + 'd'
}

/** Project path with the home directory shown as `~`; only a match on a path boundary counts. */
export const projectLabel = (cwd: string, home: string): string => {
  const base = home.length > 1 ? home.replace(/\/+$/, '') : home
  if (!base || base === '/') return cwd
  if (cwd === base) return '~'
  return cwd.startsWith(base + '/') ? '~' + cwd.slice(base.length) : cwd
}

/** A running or waiting main silent past the limit is unknown: a killed process sends no end event. */
export const markStaleMain = (state: SessionState, lastAt: number, now: number): SessionState => {
  const main = state.agents[MAIN]
  const isLive = main !== undefined && (main.status === 'running' || main.status === 'waiting')
  if (!isLive || now - lastAt <= UNKNOWN_AFTER_MS) return state
  return { ...state, agents: { ...state.agents, [MAIN]: { ...main, status: 'unknown' } } }
}

/** One session as a list row; agent statuses come from `buildRows` so the rules match the dialog. */
export const summarizeSession = (
  state: SessionState,
  info: { readonly project: string; readonly lastAt: number },
  now: number,
): SessionListItem => {
  const rows = buildRows(markStaleMain(state, info.lastAt, now), now)
  const count = (status: RowStatus): number => rows.filter(row => row.st === status).length
  const running = count('running')
  const waiting = count('waiting')
  const mainRow = rows.find(row => row.id === MAIN)
  const status: RowStatus =
    running > 0 ? 'running'
    : waiting > 0 ? 'waiting'
    : mainRow?.st === 'unknown' ? 'unknown'
    : count('failed') > 0 ? 'failed'
    : 'done'

  const activeRows = rows.filter(row => row.st === 'running' || row.st === 'waiting')
  const newest = activeRows.reduce<(typeof rows)[number] | undefined>(
    (best, row) =>
      best === undefined || state.agents[row.id].startedAt >= state.agents[best.id].startedAt ? row : best,
    undefined,
  )
  const act =
    status === 'done' ? 'session finished'
    : status === 'unknown' ? 'no heartbeat'
    : newest?.act || DASH

  const plan = planOf(state.todos[MAIN])
  const suffix = running > 0 ? ` (${running} run)` : waiting > 0 ? ` (${waiting} wait)` : ''
  return {
    status,
    project: info.project,
    id: state.sessionId.slice(0, SESSION_ID_LENGTH),
    agents: rows.length + suffix,
    tok: rows.reduce((sum, row) => sum + row.i + row.o, 0),
    ...(rows.some(row => row.outputPartial) ? { isTokPartial: true as const } : {}),
    // The CLI never shows cost, so there is nothing to sum.
    cost: 0,
    plan: plan ? Math.round(plan.done / plan.total * 100) + '%' : DASH,
    act,
    ago: fmtAgo(now - info.lastAt),
  }
}

/** Splits sessions into ACTIVE (running or waiting) and RECENT, each newest start first and stable. */
export const groupSessions = (
  entries: ReadonlyArray<{ readonly item: SessionListItem; readonly startedAt: number }>,
): { active: SessionListItem[]; recent: SessionListItem[] } => {
  const newestFirst = [...entries].sort((left, right) => right.startedAt - left.startedAt)
  const isActive = (status: RowStatus): boolean => status === 'running' || status === 'waiting'
  return {
    active: newestFirst.filter(entry => isActive(entry.item.status)).map(entry => entry.item),
    recent: newestFirst.filter(entry => !isActive(entry.item.status)).map(entry => entry.item),
  }
}
