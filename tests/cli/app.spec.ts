import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  handleKey, hasLiveAgents, initialAppState, parseKeys, renderApp,
  type AppState, type CliSession, type RenderOpts,
} from '../../src/cli/app'
import type { AgentEvent } from '../../src/core/model'
import { UNKNOWN_AFTER_MS } from '../../src/core/model'
import { initialState, reduce } from '../../src/core/reducer'
import { stripCodes } from '../../src/view/lines'

const NOW = 1_000_000
const mainTurn: AgentEvent = { kind: 'turn', at: 1, agentId: 'main', phase: 'start' }
const spawn = (id: string, at = 2): AgentEvent => ({ kind: 'agent.start', at, id, type: 'worker', description: id })
const session = (
  sessionId: string, startedAt: number, events: ReadonlyArray<AgentEvent>, lastAt = NOW,
): CliSession => ({
  sessionId, cwd: '/home/u/proj', startedAt, lastAt,
  state: events.reduce(reduce, initialState(sessionId, startedAt)),
})

// Display order: S1 (running, newer) and S3 (running, older) are ACTIVE, S2 (idle) is RECENT.
const S1 = session('aaaaaaaa-1', 10, [mainTurn, spawn('a'), spawn('b', 3)])
const S2 = session('bbbbbbbb-2', 20, [])
const S3 = session('cccccccc-3', 5, [mainTurn])
const SESSIONS = [S1, S2, S3]

const opts: RenderOpts = { home: '/home/u', ascii: false, spin: '⠋', clock: () => '12:00:00', dayStart: 0 }
const at = (partial: Partial<AppState> & Pick<AppState, 'screen'>): AppState => partial
const key = (app: AppState, pressed: Parameters<typeof handleKey>[1], sessions = SESSIONS) =>
  handleKey(app, pressed, sessions, NOW)

test('parseKeys decodes arrows, enter, esc and q', () => {
  assert.deepEqual(parseKeys('\x1b[A\x1b[B\r\x1b'), ['up', 'down', 'enter', 'esc'])
})

test('parseKeys reads q, Q and Ctrl-C as q', () => {
  assert.deepEqual(parseKeys('qQ\x03'), ['q', 'q', 'q'])
})

test('parseKeys reads k and j as up and down', () => {
  assert.deepEqual(parseKeys('kj'), ['up', 'down'])
})

test('parseKeys reads a newline as enter and CRLF as one enter', () => {
  assert.deepEqual(parseKeys('\n\r\n'), ['enter', 'enter'])
})

test('parseKeys swallows an unknown escape sequence as one other', () => {
  assert.deepEqual(parseKeys('\x1b[1;5C\x1b[Ax'), ['other', 'up', 'other'])
})

test('parseKeys reads application-mode arrows', () => {
  assert.deepEqual(parseKeys('\x1bOA\x1bOB'), ['up', 'down'])
})

test('list: down moves the selection along ACTIVE then RECENT', () => {
  const first = key(initialAppState(), 'down') as AppState
  assert.equal(first.sessionId, 'cccccccc-3')
  assert.equal((key(first, 'down') as AppState).sessionId, 'bbbbbbbb-2')
})

test('list: up from the first item wraps to the last', () => {
  assert.equal((key(at({ screen: 'list', sessionId: 'aaaaaaaa-1' }), 'up') as AppState).sessionId, 'bbbbbbbb-2')
})

test('list: enter opens the selected session', () => {
  const next = key(at({ screen: 'list', sessionId: 'bbbbbbbb-2' }), 'enter') as AppState
  assert.equal(next.screen, 'session')
  assert.equal(next.sessionId, 'bbbbbbbb-2')
})

test('list: enter with nothing selected opens the first session', () => {
  assert.equal((key(initialAppState(), 'enter') as AppState).sessionId, 'aaaaaaaa-1')
})

test('list: esc does nothing', () => {
  const app = at({ screen: 'list', sessionId: 'bbbbbbbb-2' })
  assert.deepEqual(key(app, 'esc'), app)
})

test('list: q quits', () => {
  assert.equal(key(initialAppState(), 'q'), 'quit')
})

test('list: a vanished selection falls back to the first item', () => {
  assert.equal((key(at({ screen: 'list', sessionId: 'gone' }), 'enter') as AppState).sessionId, 'aaaaaaaa-1')
})

test('list: with no sessions nothing is selected and enter does nothing', () => {
  assert.deepEqual(key(initialAppState(), 'down', []), initialAppState())
  assert.deepEqual(key(initialAppState(), 'enter', []), initialAppState())
})

test('session: down selects the next agent in tree order', () => {
  const next = key(at({ screen: 'session', sessionId: 'aaaaaaaa-1', agentId: 'main' }), 'down') as AppState
  assert.equal(next.agentId, 'a')
})

test('session: up selects the previous agent', () => {
  const next = key(at({ screen: 'session', sessionId: 'aaaaaaaa-1', agentId: 'b' }), 'up') as AppState
  assert.equal(next.agentId, 'a')
})

test('session: a vanished agent falls back to the first one', () => {
  const next = key(at({ screen: 'session', sessionId: 'aaaaaaaa-1', agentId: 'gone' }), 'enter') as AppState
  assert.equal(next.agentId, 'main')
})

test('session: enter opens the detail of the selected agent', () => {
  const next = key(at({ screen: 'session', sessionId: 'aaaaaaaa-1', agentId: 'b' }), 'enter') as AppState
  assert.equal(next.screen, 'detail')
  assert.equal(next.agentId, 'b')
})

test('session: esc goes back to the list with the same session selected', () => {
  const next = key(at({ screen: 'session', sessionId: 'bbbbbbbb-2', agentId: 'main' }), 'esc') as AppState
  assert.equal(next.screen, 'list')
  assert.equal(next.sessionId, 'bbbbbbbb-2')
})

test('session: q quits', () => {
  assert.equal(key(at({ screen: 'session', sessionId: 'aaaaaaaa-1' }), 'q'), 'quit')
})

test('session: a vanished session falls back to the list', () => {
  assert.equal((key(at({ screen: 'session', sessionId: 'gone' }), 'down') as AppState).screen, 'list')
})

test('detail: down shows the next agent', () => {
  const next = key(at({ screen: 'detail', sessionId: 'aaaaaaaa-1', agentId: 'a' }), 'down') as AppState
  assert.deepEqual([next.screen, next.agentId], ['detail', 'b'])
})

test('detail: up shows the previous agent', () => {
  const next = key(at({ screen: 'detail', sessionId: 'aaaaaaaa-1', agentId: 'a' }), 'up') as AppState
  assert.deepEqual([next.screen, next.agentId], ['detail', 'main'])
})

test('detail: enter does nothing', () => {
  const app = at({ screen: 'detail', sessionId: 'aaaaaaaa-1', agentId: 'a' })
  assert.deepEqual(key(app, 'enter'), app)
})

test('detail: esc goes back to the session with the same agent selected', () => {
  const next = key(at({ screen: 'detail', sessionId: 'aaaaaaaa-1', agentId: 'b' }), 'esc') as AppState
  assert.deepEqual([next.screen, next.sessionId, next.agentId], ['session', 'aaaaaaaa-1', 'b'])
})

test('detail: q quits', () => {
  assert.equal(key(at({ screen: 'detail', sessionId: 'aaaaaaaa-1', agentId: 'a' }), 'q'), 'quit')
})

const screens: [string, AppState][] = [
  ['list', initialAppState()],
  ['session', at({ screen: 'session', sessionId: 'aaaaaaaa-1' })],
  ['detail', at({ screen: 'detail', sessionId: 'aaaaaaaa-1', agentId: 'a' })],
]
for (const [name, app] of screens) {
  for (const [columns, rows] of [[120, 30], [80, 12], [60, 10]]) {
    test(`${name} renders exactly ${rows} lines at ${columns} columns`, () => {
      assert.equal(renderApp(app, SESSIONS, NOW, columns, rows, opts).lines.length, rows)
    })
  }
}

test('many agents still fit the rows and keep the window', () => {
  const many = session('dddddddd-4', 1, [mainTurn, ...Array.from({ length: 30 }, (_, i) => spawn('w' + i, 2 + i))])
  const app = at({ screen: 'session', sessionId: 'dddddddd-4', agentId: 'w25' })
  const result = renderApp(app, [many], NOW, 100, 20, opts)
  assert.equal(result.lines.length, 20)
  assert.ok(result.app.agentWin && result.app.agentWin[0] <= 26 && result.app.agentWin[1] > 26)
})

test('many sessions fit the rows and keep the window', () => {
  const many = Array.from({ length: 30 }, (_, i) => session('s' + String(i).padStart(7, '0'), i, [mainTurn]))
  const result = renderApp(at({ screen: 'list', sessionId: 's0000025' }), many, NOW, 100, 20, opts)
  assert.equal(result.lines.length, 20)
  assert.ok(result.app.listWin)
})

test('the list shows a dash instead of cost', () => {
  const text = renderApp(initialAppState(), SESSIONS, NOW, 120, 30, opts).lines.map(stripCodes).join('\n')
  assert.match(text, /tok today · —/)
  assert.doesNotMatch(text, /\$/)
})

test('the list totals only tokens from sessions active since dayStart', () => {
  const busy = session('eeeeeeee-5', 1, [
    mainTurn, { kind: 'usage', at: 2, agentId: 'main', tokens: { input: 5000, output: 0, cacheRead: 0, cacheWrite: 0 } },
  ], 100)
  const shown = (dayStart: number): string =>
    renderApp(initialAppState(), [busy], NOW, 120, 30, { ...opts, dayStart }).lines.map(stripCodes).join('\n')
  assert.match(shown(0), /5\.0k tok today/)
  assert.match(shown(500), /0 tok today/)
})

test('a stale running session shows unknown in the list', () => {
  const stale = session('ffffffff-6', 1, [mainTurn], 0)
  const text = renderApp(initialAppState(), [stale], UNKNOWN_AFTER_MS + 5000, 120, 30, opts)
    .lines.map(stripCodes).join('\n')
  assert.match(text, /\? unknown/)
})

test('a stale running session shows unknown in the session screen', () => {
  const stale = session('ffffffff-6', 1, [mainTurn], 0)
  const app = at({ screen: 'session', sessionId: 'ffffffff-6' })
  const text = renderApp(app, [stale], UNKNOWN_AFTER_MS + 5000, 120, 30, opts).lines.map(stripCodes).join('\n')
  assert.match(text, /1 unknown/)
})

test('the session screen shows the project path, short id and no cost', () => {
  const text = renderApp(at({ screen: 'session', sessionId: 'aaaaaaaa-1' }), SESSIONS, NOW, 120, 30, opts)
    .lines.map(stripCodes).join('\n')
  assert.match(text, /session aaaaaaaa · ~\/proj/)
  assert.match(text, /esc sessions/)
  assert.doesNotMatch(text, /\$/)
})

test('the detail screen shows its hints', () => {
  const text = renderApp(screens[2][1], SESSIONS, NOW, 120, 40, opts).lines.map(stripCodes).join('\n')
  assert.match(text, /prev \/ next agent/)
})

test('renderApp resolves a vanished selection into the returned state', () => {
  const result = renderApp(at({ screen: 'list', sessionId: 'gone' }), SESSIONS, NOW, 120, 30, opts)
  assert.equal(result.app.sessionId, 'aaaaaaaa-1')
})

test('renderApp falls back to the list when the open session vanished', () => {
  const result = renderApp(at({ screen: 'session', sessionId: 'gone' }), SESSIONS, NOW, 120, 30, opts)
  assert.equal(result.app.screen, 'list')
})

test('ascii mode leaves no box-drawing glyphs', () => {
  const text = renderApp(initialAppState(), SESSIONS, NOW, 120, 30, { ...opts, ascii: true }).lines.join('\n')
  assert.doesNotMatch(text, /[╭╮╰╯│─⠋⏎]/)
})

test('a terminal under 60 columns shows one dim message padded to rows', () => {
  const { lines } = renderApp(initialAppState(), SESSIONS, NOW, 59, 30, opts)
  assert.equal(lines.length, 30)
  assert.equal(lines[0], '{d|agentview needs at least 60×10}')
  assert.ok(lines.slice(1).every(line => line === ''))
})

test('a terminal under 10 rows shows the message too', () => {
  const { lines } = renderApp(initialAppState(), SESSIONS, NOW, 120, 9, opts)
  assert.equal(lines.length, 9)
  assert.match(stripCodes(lines[0]), /needs at least 60×10/)
})

test('hasLiveAgents is true on the list when a session is running', () => {
  assert.equal(hasLiveAgents(SESSIONS, initialAppState(), NOW), true)
})

test('hasLiveAgents is false on the list when nothing runs', () => {
  assert.equal(hasLiveAgents([S2], initialAppState(), NOW), false)
})

test('hasLiveAgents on a session screen looks at its agents', () => {
  assert.equal(hasLiveAgents(SESSIONS, at({ screen: 'session', sessionId: 'aaaaaaaa-1' }), NOW), true)
  assert.equal(hasLiveAgents(SESSIONS, at({ screen: 'session', sessionId: 'bbbbbbbb-2' }), NOW), false)
})

test('hasLiveAgents on detail looks at the shown agent only', () => {
  const done: AgentEvent[] = [mainTurn, spawn('a'), { kind: 'agent.end', at: 4, id: 'a', ok: true }]
  const ended = session('gggggggg-7', 1, done)
  assert.equal(hasLiveAgents([ended], at({ screen: 'detail', sessionId: 'gggggggg-7', agentId: 'a' }), NOW), false)
  assert.equal(hasLiveAgents([ended], at({ screen: 'detail', sessionId: 'gggggggg-7', agentId: 'main' }), NOW), true)
})

test('hasLiveAgents is false for a stale session', () => {
  const stale = session('ffffffff-6', 1, [mainTurn], 0)
  assert.equal(hasLiveAgents([stale], initialAppState(), UNKNOWN_AFTER_MS + 5000), false)
})
