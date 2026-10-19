import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeOnly, hasPendingExpiry, KEEP_FINISHED_MS } from '../../src/core/active'
import { initialState } from '../../src/core/reducer'
import { MAIN, ZERO } from '../../src/core/model'
import type { AgentNode, AgentStatus, SessionState } from '../../src/core/model'

const NOW = 1_000_000

const agent = (id: string, status: AgentStatus, extra: Partial<AgentNode> = {}): AgentNode => ({
  id, parentId: MAIN, type: 'worker', description: id, status, startedAt: 0, lastSignal: 0,
  recent: [], toolCount: 0, tokens: ZERO, ...extra,
})

const sessionOf = (...agents: AgentNode[]): SessionState => {
  const base = initialState('s1', 0)
  return { ...base, agents: { ...base.agents, ...Object.fromEntries(agents.map(node => [node.id, node])) } }
}

const idsOf = (state: SessionState): string[] => Object.keys(state.agents).sort()

test('a running agent stays visible', () => {
  const { state, hiddenCount } = activeOnly(sessionOf(agent('a', 'running')), NOW)
  assert.deepEqual(idsOf(state), ['a', 'main'])
  assert.equal(hiddenCount, 0)
})

test('waiting and unknown agents stay visible', () => {
  const { state } = activeOnly(sessionOf(agent('a', 'waiting'), agent('b', 'unknown')), NOW)
  assert.deepEqual(idsOf(state), ['a', 'b', 'main'])
})

test('a finished agent stays visible inside the keep window', () => {
  const { state } = activeOnly(sessionOf(agent('a', 'done', { endedAt: NOW - KEEP_FINISHED_MS + 1 })), NOW)
  assert.deepEqual(idsOf(state), ['a', 'main'])
})

test('a finished agent disappears once the keep window has passed', () => {
  const { state, hiddenCount } = activeOnly(sessionOf(agent('a', 'done', { endedAt: NOW - KEEP_FINISHED_MS })), NOW)
  assert.deepEqual(idsOf(state), ['main'])
  assert.equal(hiddenCount, 1)
})

test('an old failed agent is hidden', () => {
  const { state } = activeOnly(sessionOf(agent('a', 'failed', { endedAt: 0 })), NOW)
  assert.deepEqual(idsOf(state), ['main'])
})

test('a finished agent without endedAt is hidden', () => {
  const { state } = activeOnly(sessionOf(agent('a', 'done')), NOW)
  assert.deepEqual(idsOf(state), ['main'])
})

test('main stays visible even when it is finished long ago', () => {
  const base = initialState('s1', 0)
  const { state } = activeOnly(base, NOW)
  assert.ok(state.agents.main)
})

test('the ancestors of a kept agent stay so the tree is connected', () => {
  const { state, hiddenCount } = activeOnly(sessionOf(
    agent('parent', 'done', { endedAt: 0 }),
    agent('child', 'running', { parentId: 'parent' }),
    agent('old', 'done', { endedAt: 0 }),
  ), NOW)
  assert.deepEqual(idsOf(state), ['child', 'main', 'parent'])
  assert.equal(hiddenCount, 1)
})

test('the same object comes back when nothing is hidden', () => {
  const session = sessionOf(agent('a', 'running'))
  assert.equal(activeOnly(session, NOW).state, session)
})

test('the input session is not mutated', () => {
  const session = sessionOf(agent('a', 'done', { endedAt: 0 }))
  activeOnly(session, NOW)
  assert.deepEqual(idsOf(session), ['a', 'main'])
})

test('a cyclic parent chain does not hang', () => {
  const session = sessionOf(
    agent('a', 'running', { parentId: 'b' }),
    agent('b', 'done', { parentId: 'a', endedAt: 0 }),
  )
  assert.deepEqual(idsOf(activeOnly(session, NOW).state), ['a', 'b', 'main'])
})

test('expiry is pending while a finished agent is inside the window', () => {
  assert.equal(hasPendingExpiry(sessionOf(agent('a', 'done', { endedAt: NOW - 1 })), NOW), true)
})

test('no expiry is pending for running or long finished agents', () => {
  assert.equal(hasPendingExpiry(sessionOf(agent('a', 'running'), agent('b', 'failed', { endedAt: 0 })), NOW), false)
})

test('a recently finished main does not count as pending expiry', () => {
  assert.equal(hasPendingExpiry(initialState('s1', NOW - 1), NOW), false)
})
