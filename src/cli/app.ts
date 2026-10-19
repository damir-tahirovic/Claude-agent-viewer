// Pure core of the standalone CLI: screen state, key handling and rendering. The Node loop lives in main.ts.
// This file must not import `src/mod`; the few small helpers below are copies of the plugin's ideas.
import { MAIN, type SessionState } from '../core/model'
import { planOf } from '../core/progress'
import { renderDetail } from '../view/detail'
import { renderDialog, windowFor } from '../view/dialog'
import { clipLine, dim, toPlainAscii } from '../view/lines'
import { buildRows, type Row } from '../view/rows'
import { renderSessions, type SessionListItem } from '../view/sessions'
import { groupSessions, markStaleMain, projectLabel, summarizeSession } from './session-list'

/** One session as the watcher delivers it: its reduced state plus file-level facts. */
export type CliSession = {
  readonly sessionId: string
  readonly cwd?: string
  readonly state: SessionState
  readonly startedAt: number
  readonly lastAt: number
}

/** Which screen is open and what is selected; selection is an id, never an index. */
export type AppState = {
  readonly screen: 'list' | 'session' | 'detail'
  /** Selected session (list) or open session (session, detail). */
  readonly sessionId?: string
  /** Selected agent (session) or shown agent (detail). */
  readonly agentId?: string
  /** Window of the session list as last drawn, so scrolling moves by the least. */
  readonly listWin?: [number, number]
  /** Window of the agent rows as last drawn. */
  readonly agentWin?: [number, number]
}

/** A decoded key press. */
export type Key = 'up' | 'down' | 'enter' | 'esc' | 'q' | 'other'

/** Options of one render; `dayStart` is local midnight in ms, computed by the caller (no timezone here). */
export type RenderOpts = {
  readonly home: string
  readonly ascii: boolean
  readonly spin: string
  readonly clock: (ms: number) => string
  readonly dayStart: number
}

const MIN_COLUMNS = 60
const MIN_ROWS = 10
const TOO_SMALL_TEXT = 'agentview needs at least 60×10'
const ASCII_SPIN = '*'
const SESSION_ID_LENGTH = 8
const MIN_DETAIL_COLUMNS = 90
// Dialog lines around the agent rows: top, summary, rule, heads before; rule, plan, rule, hints, bottom after.
const DIALOG_HEAD_LINES = 4
const DIALOG_FOOT_LINES = 5
// Scroll hints above and below the rows are both reserved once the agents need a window.
const SCROLL_HINT_LINES = 2
// Session list lines outside the sessions (same as renderSessions): top, rule, heads, rule, hints, bottom.
const LIST_CHROME_LINES = 6
const SESSION_HINTS: [string, string][] = [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'sessions'], ['q', 'quit']]
const DETAIL_HINTS: [string, string][] = [['↑↓', 'prev / next agent'], ['esc', 'back to tree'], ['q', 'quit']]

/** The list screen with nothing selected yet. */
export const initialAppState = (): AppState => ({ screen: 'list' })

/** Splits a raw stdin chunk into keys; unknown input becomes 'other' so it is consumed, not misread. */
export const parseKeys = (input: string): Key[] => {
  const keys: Key[] = []
  let at = 0
  while (at < input.length) {
    const char = input[at]
    at++
    if (char === '\x1b') {
      const introducer = input[at]
      if (introducer === '[') {
        // CSI: parameters, then one final byte in @..~.
        let end = at + 1
        while (end < input.length && !(input[end] >= '@' && input[end] <= '~')) end++
        const final = input[end]
        keys.push(final === 'A' && end === at + 1 ? 'up' : final === 'B' && end === at + 1 ? 'down' : 'other')
        at = end + 1
      } else if (introducer === 'O') {
        // SS3, sent by terminals in application cursor mode.
        const final = input[at + 1]
        keys.push(final === 'A' ? 'up' : final === 'B' ? 'down' : 'other')
        at += 2
      } else {
        keys.push('esc')
      }
    } else if (char === '\r') {
      keys.push('enter')
      if (input[at] === '\n') at++
    } else if (char === '\n') keys.push('enter')
    else if (char === 'q' || char === 'Q' || char === '\x03') keys.push('q')
    else if (char === 'k') keys.push('up')
    else if (char === 'j') keys.push('down')
    else keys.push('other')
  }
  return keys
}

/** The id `offset` steps from `current` in `order`, wrapping; an unknown current counts as the first. */
const stepId = (order: ReadonlyArray<string>, current: string | undefined, offset: number): string | undefined => {
  if (order.length === 0) return undefined
  const at = Math.max(0, current === undefined ? 0 : order.indexOf(current))
  return order[(at + (offset % order.length) + order.length) % order.length]
}

/** `current` when it is still in `order`, else the first id (or none). */
const resolveId = (order: ReadonlyArray<string>, current: string | undefined): string | undefined =>
  current !== undefined && order.includes(current) ? current : order[0]

type ListEntry = { readonly session: CliSession; readonly item: SessionListItem }

/** Sessions as list rows in display order: ACTIVE then RECENT, exactly as `groupSessions` orders them. */
const listOrder = (sessions: ReadonlyArray<CliSession>, now: number, home: string) => {
  const entries: ListEntry[] = sessions.map(session => ({
    session,
    item: summarizeSession(
      session.state,
      { project: session.cwd === undefined ? '—' : projectLabel(session.cwd, home), lastAt: session.lastAt },
      now,
    ),
  }))
  const grouped = groupSessions(entries.map(entry => ({ item: entry.item, startedAt: entry.session.startedAt })))
  const sessionOf = new Map(entries.map(entry => [entry.item, entry.session]))
  const active = grouped.active
  const recent = grouped.recent
  const ordered = [...active, ...recent]
  return {
    active,
    recent,
    items: ordered,
    ids: ordered.map(item => (sessionOf.get(item) as CliSession).sessionId),
    sessionOf: (item: SessionListItem) => sessionOf.get(item) as CliSession,
  }
}

/** Agent rows in tree order for a session, with a silent main shown as unknown like the list does. */
const agentRows = (session: CliSession, now: number): { state: SessionState; rows: Row[] } => {
  const state = markStaleMain(session.state, session.lastAt, now)
  return { state, rows: buildRows(state, now) }
}

/** Falls back to the list when the open session has vanished. */
const settle = (app: AppState, sessions: ReadonlyArray<CliSession>): AppState =>
  app.screen !== 'list' && !sessions.some(session => session.sessionId === app.sessionId)
    ? { screen: 'list', listWin: app.listWin }
    : app

/**
 * Applies one key per the key table of AGENTVIEW.md §3.5. Up/down wrap around, like the plugin's prev/next.
 * A selected id that vanished falls back to the first item; with no sessions the list selects nothing.
 */
export const handleKey = (
  app: AppState,
  key: Key,
  sessions: ReadonlyArray<CliSession>,
  now: number,
): AppState | 'quit' => {
  if (key === 'q') return 'quit'
  const current = settle(app, sessions)
  const step = key === 'up' ? -1 : key === 'down' ? 1 : 0

  if (current.screen === 'list') {
    const ids = listOrder(sessions, now, '').ids
    const selected = resolveId(ids, current.sessionId)
    if (step !== 0) return selected === undefined ? current : { ...current, sessionId: stepId(ids, selected, step) }
    if (key === 'enter' && selected !== undefined) {
      return { screen: 'session', sessionId: selected, listWin: current.listWin }
    }
    return current
  }

  const session = sessions.find(candidate => candidate.sessionId === current.sessionId) as CliSession
  const order = agentRows(session, now).rows.map(row => row.id)
  const agentId = resolveId(order, current.agentId)
  if (step !== 0) return { ...current, agentId: stepId(order, agentId, step) }
  if (current.screen === 'session') {
    if (key === 'enter') return { ...current, screen: 'detail', agentId }
    if (key === 'esc') return { screen: 'list', sessionId: current.sessionId, listWin: current.listWin }
    return current
  }
  return key === 'esc' ? { ...current, screen: 'session', agentId } : current
}

/** True when the visible screen shows a running agent, so the caller redraws once a second for clock and spinner. */
export const hasLiveAgents = (sessions: ReadonlyArray<CliSession>, app: AppState, now: number): boolean => {
  const current = settle(app, sessions)
  if (current.screen === 'list') return listOrder(sessions, now, '').items.some(item => item.status === 'running')
  const session = sessions.find(candidate => candidate.sessionId === current.sessionId) as CliSession
  const rows = agentRows(session, now).rows
  if (current.screen === 'session') return rows.some(row => row.st === 'running')
  return rows.find(row => row.id === resolveId(rows.map(r => r.id), current.agentId))?.st === 'running'
}

/** Pads with empty lines or cuts so the screen is exactly `rows` lines. */
const fitRows = (lines: ReadonlyArray<string>, rows: number): string[] =>
  Array.from({ length: rows }, (_, index) => lines[index] ?? '')

/**
 * Renders the open screen as exactly `rows` coded lines. Returns the app too: the scroll windows are
 * remembered in it (and a vanished selection is resolved), so the caller must keep the returned state.
 */
export const renderApp = (
  app: AppState,
  sessions: ReadonlyArray<CliSession>,
  now: number,
  columns: number,
  rows: number,
  opts: RenderOpts,
): { lines: string[]; app: AppState } => {
  if (columns < MIN_COLUMNS || rows < MIN_ROWS) return { lines: fitRows([dim(TOO_SMALL_TEXT)], rows), app }
  const spin = opts.ascii ? ASCII_SPIN : opts.spin
  const finish = (lines: ReadonlyArray<string>): string[] =>
    fitRows(opts.ascii ? lines.map(toPlainAscii) : lines, rows)
  const current = settle(app, sessions)

  if (current.screen === 'list') {
    const grouped = listOrder(sessions, now, opts.home)
    const selected = resolveId(grouped.ids, current.sessionId)
    const selectedItem = grouped.items[selected === undefined ? -1 : grouped.ids.indexOf(selected)]
    const totalTok = grouped.items.reduce(
      (sum, item) => sum + (grouped.sessionOf(item).lastAt >= opts.dayStart ? item.tok : 0), 0)
    const isTotalPartial = grouped.items.some(
      item => item.isTokPartial === true && grouped.sessionOf(item).lastAt >= opts.dayStart)
    // Same capacity as renderSessions uses, so the window it draws is the one remembered here.
    const groupCount = (grouped.active.length ? 1 : 0) + (grouped.recent.length ? 1 : 0)
    const capacity = Math.max(1, rows - LIST_CHROME_LINES - (groupCount + (groupCount === 2 ? 1 : 0) + 2))
    const selIndex = Math.max(0, selected === undefined ? 0 : grouped.ids.indexOf(selected))
    const listWin = grouped.items.length > capacity
      ? windowFor(grouped.items.length, selIndex, capacity, current.listWin) : undefined
    const lines = renderSessions({
      W: columns, active: grouped.active, recent: grouped.recent, selId: selectedItem?.id,
      totalTok, isTotalPartial, totalCost: 0, hasCost: false, spin, ascii: false, minRows: rows, win: listWin,
    })
    return { lines: finish(lines), app: { screen: 'list', sessionId: selected, listWin } }
  }

  const session = sessions.find(candidate => candidate.sessionId === current.sessionId) as CliSession
  const { state, rows: agents } = agentRows(session, now)
  const agentId = resolveId(agents.map(row => row.id), current.agentId)
  const selected = Math.max(0, agents.findIndex(row => row.id === agentId))

  if (current.screen === 'session') {
    const room = rows - DIALOG_HEAD_LINES - DIALOG_FOOT_LINES
    const hasWindow = agents.length > room
    const agentWin = hasWindow
      ? windowFor(agents.length, selected, room - SCROLL_HINT_LINES, current.agentWin) : undefined
    const lines = renderDialog({
      W: columns, agents, sel: selected, sid: session.sessionId.slice(0, SESSION_ID_LENGTH),
      path: session.cwd === undefined ? undefined : projectLabel(session.cwd, opts.home),
      plan: planOf(state.todos[MAIN]), win: agentWin, spin, ascii: false, hints: SESSION_HINTS,
      minRows: rows - DIALOG_FOOT_LINES, billing: { kind: 'unknown' },
    })
    return { lines: finish(lines), app: { ...current, agentId, agentWin } }
  }

  const agent = state.agents[agentId ?? '']
  const parent = agent?.parentId ? state.agents[agent.parentId] : undefined
  const lines = agent === undefined ? [] : renderDetail({
    W: Math.max(columns, MIN_DETAIL_COLUMNS), agent, parentName: parent?.type ?? '—',
    todos: state.todos[agent.id], now, clock: opts.clock, cost: agents[selected].cost,
    spin, ascii: false, hints: DETAIL_HINTS, billing: { kind: 'unknown' },
  })
  // Below 90 columns the detail is cut, not reflowed (same limit as the plugin).
  return { lines: finish(lines.map(line => clipLine(line, columns))), app: { ...current, agentId } }
}
