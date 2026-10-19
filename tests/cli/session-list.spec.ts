import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fmtAgo, groupSessions, markStaleMain, projectLabel, summarizeSession } from '../../src/cli/session-list'
import type { AgentEvent, SessionState } from '../../src/core/model'
import { UNKNOWN_AFTER_MS } from '../../src/core/model'
import { initialState, reduce } from '../../src/core/reducer'
import type { SessionListItem } from '../../src/view/sessions'

const build = (events: ReadonlyArray<AgentEvent>, sessionId = 'abcdef1234567890'): SessionState =>
  events.reduce(reduce, initialState(sessionId, 0))
const info = { project: '~/p', lastAt: 0 }
const mainTurn: AgentEvent = { kind: 'turn', at: 1, agentId: 'main', phase: 'start' }
const spawn = (id: string, at = 2): AgentEvent =>
  ({ kind: 'agent.start', at, id, type: 'worker', description: id })
const tool = (agentId: string, at: number, command: string): AgentEvent =>
  ({ kind: 'tool.start', at, agentId, toolUseId: agentId + at, tool: 'Bash', input: { command } })

test('id is the first 8 chars of the session id', () => {
  assert.equal(summarizeSession(build([]), info, 0).id, 'abcdef12')
})

test('a running subagent makes the session running with a run count', () => {
  const item = summarizeSession(build([mainTurn, spawn('a')]), info, 5)
  assert.equal(item.status, 'running')
  assert.equal(item.agents, '2 (2 run)')
})

test('waiting only gives a wait count', () => {
  const state = build([mainTurn, spawn('a'), { kind: 'waiting', at: 3, agentId: 'main' }, { kind: 'waiting', at: 3, agentId: 'a' }])
  const item = summarizeSession(state, info, 5)
  assert.equal(item.status, 'waiting')
  assert.equal(item.agents, '2 (2 wait)')
})

test('no running or waiting agents shows the plain count', () => {
  assert.equal(summarizeSession(build([]), info, 0).agents, '1')
})

test('an idle session is done and says session finished', () => {
  const item = summarizeSession(build([]), info, 0)
  assert.equal(item.status, 'done')
  assert.equal(item.act, 'session finished')
})

test('a failed subagent in an idle session is failed', () => {
  const state = build([mainTurn, spawn('a'), { kind: 'agent.end', at: 3, id: 'a', ok: false }, { kind: 'turn', at: 4, agentId: 'main', phase: 'end' }])
  assert.equal(summarizeSession(state, info, 5).status, 'failed')
})

test('tok sums input and output of all agents', () => {
  const usage = (agentId: string, input: number, output: number): AgentEvent =>
    ({ kind: 'usage', at: 3, agentId, tokens: { input, output, cacheRead: 99, cacheWrite: 99 } })
  const item = summarizeSession(build([mainTurn, spawn('a'), usage('main', 10, 5), usage('a', 100, 20)]), info, 5)
  assert.equal(item.tok, 135)
})

test('cost is always zero', () => {
  assert.equal(summarizeSession(build([mainTurn]), info, 5).cost, 0)
})

test('plan is the main plan percent', () => {
  const todos: AgentEvent = {
    kind: 'todos', at: 2, agentId: 'main',
    todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'pending' }, { content: 'c', status: 'pending' }],
  } as AgentEvent
  assert.equal(summarizeSession(build([mainTurn, todos]), info, 5).plan, '33%')
})

test('plan is a dash without a todo list', () => {
  assert.equal(summarizeSession(build([mainTurn]), info, 5).plan, '—')
})

test('act is the summary of the newest running agent', () => {
  const state = build([mainTurn, tool('main', 2, 'ls'), spawn('a', 3), tool('a', 4, 'pwd')])
  assert.match(summarizeSession(state, info, 5).act, /pwd/)
})

test('act is a dash when active agents have no action', () => {
  assert.equal(summarizeSession(build([mainTurn]), info, 5).act, '—')
})

test('unknown main shows no heartbeat', () => {
  const base = build([mainTurn])
  const state: SessionState = { ...base, agents: { ...base.agents, main: { ...base.agents.main, status: 'unknown' } } }
  const item = summarizeSession(state, info, 5)
  assert.equal(item.status, 'unknown')
  assert.equal(item.act, 'no heartbeat')
})

test('ago uses now minus lastAt', () => {
  assert.equal(summarizeSession(build([]), { project: 'p', lastAt: 1000 }, 96_000).ago, '1m35s')
})

test('fmtAgo covers every unit boundary', () => {
  assert.equal(fmtAgo(59_999), '59s')
  assert.equal(fmtAgo(60_000), '1m00s')
  assert.equal(fmtAgo(599_000), '9m59s')
  assert.equal(fmtAgo(600_000), '10m')
  assert.equal(fmtAgo(3_599_000), '59m')
  assert.equal(fmtAgo(3_600_000), '1h')
  assert.equal(fmtAgo(86_399_000), '23h')
  assert.equal(fmtAgo(86_400_000), '1d')
  assert.equal(fmtAgo(-5000), '0s')
})

test('projectLabel replaces the home prefix with a tilde', () => {
  assert.equal(projectLabel('/home/a/work/x', '/home/a'), '~/work/x')
  assert.equal(projectLabel('/home/a', '/home/a'), '~')
})

test('projectLabel does not match a longer sibling directory', () => {
  assert.equal(projectLabel('/home/ab/x', '/home/a'), '/home/ab/x')
})

test('projectLabel leaves paths outside home alone', () => {
  assert.equal(projectLabel('/srv/x', '/home/a'), '/srv/x')
})

const item = (id: string, status: SessionListItem['status']): SessionListItem =>
  ({ status, project: 'p', id, agents: '1', tok: 0, cost: 0, plan: '—', act: '—', ago: '1s' })

test('groupSessions splits active from recent', () => {
  const groups = groupSessions([
    { item: item('r', 'running'), startedAt: 1 }, { item: item('w', 'waiting'), startedAt: 2 },
    { item: item('d', 'done'), startedAt: 3 }, { item: item('f', 'failed'), startedAt: 4 },
    { item: item('u', 'unknown'), startedAt: 5 },
  ])
  assert.deepEqual(groups.active.map(s => s.id), ['w', 'r'])
  assert.deepEqual(groups.recent.map(s => s.id), ['u', 'f', 'd'])
})

test('groupSessions keeps input order for equal starts', () => {
  const groups = groupSessions([
    { item: item('a', 'done'), startedAt: 1 }, { item: item('b', 'done'), startedAt: 1 },
    { item: item('c', 'done'), startedAt: 1 },
  ])
  assert.deepEqual(groups.recent.map(s => s.id), ['a', 'b', 'c'])
})

test('markStaleMain turns a silent running main into unknown', () => {
  const state = markStaleMain(build([mainTurn]), 0, UNKNOWN_AFTER_MS + 1)
  assert.equal(state.agents.main.status, 'unknown')
})

test('markStaleMain keeps a fresh running main as the same object', () => {
  const state = build([mainTurn])
  assert.equal(markStaleMain(state, 0, UNKNOWN_AFTER_MS), state)
})

test('markStaleMain keeps a done main as the same object', () => {
  const state = build([])
  assert.equal(markStaleMain(state, 0, UNKNOWN_AFTER_MS * 10), state)
})

test('a stale running session lists as unknown with no heartbeat', () => {
  const item = summarizeSession(build([mainTurn]), { project: 'p', lastAt: 0 }, UNKNOWN_AFTER_MS + 1)
  assert.equal(item.status, 'unknown')
  assert.equal(item.act, 'no heartbeat')
})

test('a session with a partial-output agent is marked isTokPartial', () => {
  const state = reduce(build([]), {
    kind: 'usage', at: 1, agentId: 'main', tokens: { input: 5, output: 0, cacheRead: 0, cacheWrite: 0 }, isOutputKnown: false,
  })
  const item = summarizeSession(state, info, 5)
  assert.equal(item.isTokPartial, true)
  assert.equal(summarizeSession(build([]), info, 5).isTokPartial, undefined)
})
