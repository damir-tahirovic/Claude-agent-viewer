import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, reduce, orderTree } from '../../src/core/reducer'
import type { AgentEvent } from '../../src/core/model'

const run = (evs: AgentEvent[]) => evs.reduce(reduce, initialState('s1', 0))

test('main agent exists from the start', () => {
  const s = initialState('s1', 5)
  assert.equal(s.agents.main.status, 'running')
  assert.equal(s.agents.main.type, 'main')
})

test('subagent start, tool, end', () => {
  const s = run([
    { kind: 'agent.start', at: 10, id: 'a1', type: 'worker', description: 'fix login', model: 'claude-sonnet-5-5' },
    { kind: 'tool.start', at: 11, agentId: 'a1', toolUseId: 't1', tool: 'Edit', input: { file_path: '/x/src/a.ts' } },
  ])
  assert.equal(s.agents.a1.parentId, 'main')
  assert.equal(s.agents.a1.current?.tool, 'Edit')
  assert.equal(s.agents.a1.toolCount, 1)
  const s2 = [
    { kind: 'tool.end', at: 12, agentId: 'a1', toolUseId: 't1', ok: false } as AgentEvent,
    { kind: 'agent.end', at: 13, id: 'a1', ok: true } as AgentEvent,
  ].reduce(reduce, s)
  assert.equal(s2.agents.a1.current, undefined)
  assert.equal(s2.agents.a1.recent[0].ok, false)
  assert.equal(s2.agents.a1.recent[0].ms, 1)
  assert.equal(s2.agents.a1.status, 'done')
  assert.equal(s2.agents.a1.endedAt, 13)
})

test('usage accumulates per agent; model kept', () => {
  const t = { input: 100, output: 10, cacheRead: 5, cacheWrite: 1 }
  const s = run([
    { kind: 'usage', at: 1, agentId: 'main', model: 'claude-opus-5-5', tokens: t },
    { kind: 'usage', at: 2, agentId: 'main', tokens: t },
  ])
  assert.deepEqual(s.agents.main.tokens, { input: 200, output: 20, cacheRead: 10, cacheWrite: 2 })
  assert.equal(s.agents.main.model, 'claude-opus-5-5')
})

test('events for an unseen agent create it under main', () => {
  const s = run([{ kind: 'tool.start', at: 1, agentId: 'ghost', toolUseId: 't', tool: 'Read', input: {} }])
  assert.equal(s.agents.ghost.parentId, 'main')
  assert.equal(s.agents.ghost.type, 'agent')
})

test('waiting, then the next tool.start returns to running', () => {
  const s = run([
    { kind: 'waiting', at: 1, agentId: 'main' },
  ])
  assert.equal(s.agents.main.status, 'waiting')
  const s2 = reduce(s, { kind: 'tool.start', at: 2, agentId: 'main', toolUseId: 't', tool: 'Bash', input: { command: 'ls' } })
  assert.equal(s2.agents.main.status, 'running')
})

test('tick marks silent running subagents unknown after 60s, never main', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a1', type: 'worker', description: '' },
    { kind: 'tick', at: 60_001 },
  ])
  assert.equal(s.agents.a1.status, 'unknown')
  assert.equal(s.agents.main.status, 'running')
})

test('a signal revives an unknown agent', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a1', type: 'worker', description: '' },
    { kind: 'tick', at: 70_000 },
    { kind: 'usage', at: 70_001, agentId: 'a1', tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
  ])
  assert.equal(s.agents.a1.status, 'running')
})

test('recent keeps the last 20 actions', () => {
  let s = initialState('s', 0)
  for (let i = 0; i < 25; i++) {
    s = reduce(s, { kind: 'tool.start', at: i, agentId: 'main', toolUseId: 't' + i, tool: 'Read', input: {} })
    s = reduce(s, { kind: 'tool.end', at: i, agentId: 'main', toolUseId: 't' + i, ok: true })
  }
  assert.equal(s.agents.main.recent.length, 20)
  assert.equal(s.agents.main.toolCount, 25)
})

test('todos stored per agent', () => {
  const s = run([{ kind: 'todos', at: 1, agentId: 'main', todos: [{ content: 'a', status: 'completed' }] }])
  assert.equal(s.todos.main.length, 1)
})

test('orderTree is DFS with children by start time', () => {
  const s = run([
    { kind: 'agent.start', at: 1, id: 'w1', type: 'worker', description: '' },
    { kind: 'agent.start', at: 2, id: 'w2', type: 'worker', description: '' },
    { kind: 'agent.start', at: 3, id: 's1', parentId: 'w1', type: 'scout', description: '' },
  ])
  assert.deepEqual(orderTree(s), ['main', 'w1', 's1', 'w2'])
})

test('reduce never mutates the input state', () => {
  const s = initialState('s', 0)
  const frozen = JSON.stringify(s)
  reduce(s, { kind: 'agent.start', at: 1, id: 'a', type: 'x', description: '' })
  assert.equal(JSON.stringify(s), frozen)
})
