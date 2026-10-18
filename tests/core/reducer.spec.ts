import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, reduce, orderTree } from '../../src/core/reducer'
import type { AgentEvent } from '../../src/core/model'

const run = (evs: AgentEvent[]) => evs.reduce(reduce, initialState('s1', 0))

test('main agent exists from the start and is idle, not running', () => {
  const s = initialState('s1', 5)
  assert.equal(s.agents.main.status, 'done')
  assert.equal(s.agents.main.endedAt, 5)
  assert.equal(s.agents.main.type, 'main')
})

test('the first main turn.start makes a fresh session running', () => {
  const s = reduce(initialState('s1', 5), { kind: 'turn', at: 9, agentId: 'main', phase: 'start' })
  assert.equal(s.agents.main.status, 'running')
  assert.equal(s.agents.main.endedAt, undefined)
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
    { kind: 'turn', at: 0, agentId: 'main', phase: 'start' },
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
  assert.deepEqual(orderTree(s).map(entry => entry.id), ['main', 'w1', 's1', 'w2'])
})

test('reduce never mutates the input state', () => {
  const s = initialState('s', 0)
  const frozen = JSON.stringify(s)
  reduce(s, { kind: 'agent.start', at: 1, id: 'a', type: 'x', description: '' })
  assert.equal(JSON.stringify(s), frozen)
})

const TOOL = (at: number, id: string, agentId = 'main'): AgentEvent =>
  ({ kind: 'tool.start', at, agentId, toolUseId: id, tool: 'Bash', input: { command: id } })
const TOOL_END = (at: number, id: string, agentId = 'main', ok = true): AgentEvent =>
  ({ kind: 'tool.end', at, agentId, toolUseId: id, ok })

test('agent.start for main does not give main a parent', () => {
  const s = run([{ kind: 'agent.start', at: 1, id: 'main', parentId: 'main', type: 'x', description: '' }])
  assert.equal(s.agents.main.parentId, undefined)
  assert.deepEqual(orderTree(s), [{ id: 'main', depth: 0 }])
})

test('a parentId equal to the agent id is ignored', () => {
  const s = run([{ kind: 'agent.start', at: 1, id: 'a', parentId: 'a', type: 'x', description: '' }])
  assert.equal(s.agents.a.parentId, 'main')
})

test('orderTree survives a two-agent cycle and lists each agent once', () => {
  const s = run([
    { kind: 'agent.start', at: 1, id: 'a', parentId: 'b', type: 'x', description: '' },
    { kind: 'agent.start', at: 2, id: 'b', parentId: 'a', type: 'x', description: '' },
  ])
  const ids = orderTree(s).map(entry => entry.id)
  assert.deepEqual([...ids].sort(), ['a', 'b', 'main'])
})

test('an orphan appears under main at depth 1', () => {
  const s = run([{ kind: 'agent.start', at: 1, id: 'o', parentId: 'nobody', type: 'x', description: '' }])
  assert.deepEqual(orderTree(s), [{ id: 'main', depth: 0 }, { id: 'o', depth: 1 }])
})

test('orderTree returns depth per agent', () => {
  const s = run([
    { kind: 'agent.start', at: 1, id: 'w1', type: 'worker', description: '' },
    { kind: 'agent.start', at: 3, id: 's1', parentId: 'w1', type: 'scout', description: '' },
  ])
  assert.deepEqual(orderTree(s).map(entry => entry.depth), [0, 1, 2])
})

test('repeated agent.end keeps the first endedAt', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    { kind: 'agent.end', at: 10, id: 'a', ok: true },
    { kind: 'agent.end', at: 20, id: 'a', ok: true },
    { kind: 'agent.end', at: 30, id: 'a', ok: true },
  ])
  assert.equal(s.agents.a.endedAt, 10)
  assert.equal(s.agents.a.status, 'done')
})

test('a later failed end turns done into failed but keeps endedAt', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    { kind: 'agent.end', at: 10, id: 'a', ok: true },
    { kind: 'agent.end', at: 20, id: 'a', ok: false },
    { kind: 'agent.end', at: 30, id: 'a', ok: true },
  ])
  assert.equal(s.agents.a.status, 'failed')
  assert.equal(s.agents.a.endedAt, 10)
})

test('an agent running a tool for 120 s stays running', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    TOOL(1, 't1', 'a'),
    { kind: 'tick', at: 120_000 },
  ])
  assert.equal(s.agents.a.status, 'running')
})

test('heartbeats keep a silent agent running and revive an unknown one', () => {
  const kept = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    { kind: 'heartbeat', at: 50_000, agentId: 'a' },
    { kind: 'tick', at: 100_000 },
  ])
  assert.equal(kept.agents.a.status, 'running')
  const revived = [
    { kind: 'tick', at: 200_000 } as AgentEvent,
    { kind: 'heartbeat', at: 200_001, agentId: 'a' } as AgentEvent,
  ].reduce(reduce, kept)
  assert.equal(revived.agents.a.status, 'running')
})

test('silence with no tool in flight turns unknown', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    TOOL(1, 't1', 'a'),
    TOOL_END(2, 't1', 'a'),
    { kind: 'tick', at: 70_000 },
  ])
  assert.equal(s.agents.a.status, 'unknown')
})

test('a heartbeat does not create an unseen agent', () => {
  const s = run([{ kind: 'heartbeat', at: 1, agentId: 'ghost' }])
  assert.equal(s.agents.ghost, undefined)
})

for (const order of [['t1', 't2'], ['t2', 't1']]) {
  test(`overlapping calls ended as ${order.join(',')} keep their own recent entries`, () => {
    let s = run([TOOL(10, 't1'), TOOL(20, 't2')])
    assert.equal(s.agents.main.current?.toolUseId, 't2')
    s = reduce(s, TOOL_END(30, order[0]))
    const remaining = order[0] === 't1' ? 't2' : 't1'
    assert.equal(s.agents.main.current?.toolUseId, remaining)
    s = reduce(s, TOOL_END(40, order[1]))
    assert.equal(s.agents.main.current, undefined)
    const byTool = Object.fromEntries(s.agents.main.recent.map(action => [action.summary, action]))
    assert.equal(byTool['Bash: t1'].tool, 'Bash')
    assert.equal(byTool['Bash: t1'].ms, order[0] === 't1' ? 20 : 30)
    assert.equal(byTool['Bash: t2'].ms, order[0] === 't2' ? 10 : 20)
    assert.ok(s.agents.main.recent.every(action => action.tool !== '?'))
  })
}

test('tool.start revives a finished agent and clears endedAt', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    { kind: 'agent.end', at: 5, id: 'a', ok: true },
    TOOL(6, 't1', 'a'),
  ])
  assert.equal(s.agents.a.status, 'running')
  assert.equal(s.agents.a.endedAt, undefined)
})

test('agent.start again clears endedAt', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    { kind: 'agent.end', at: 5, id: 'a', ok: false },
    { kind: 'agent.start', at: 6, id: 'a', type: 'x', description: '' },
  ])
  assert.equal(s.agents.a.endedAt, undefined)
  assert.equal(s.agents.a.status, 'running')
})

test('main is done between turns and running again on the next turn', () => {
  const ended = run([{ kind: 'turn', at: 50, agentId: 'main', phase: 'end' }])
  assert.equal(ended.agents.main.status, 'done')
  assert.equal(ended.agents.main.endedAt, 50)
  const started = reduce(ended, { kind: 'turn', at: 60, agentId: 'main', phase: 'start' })
  assert.equal(started.agents.main.status, 'running')
  assert.equal(started.agents.main.endedAt, undefined)
})

test('a heartbeat for a running agent with a recent signal returns the same state', () => {
  const state = run([{ kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' }])
  assert.equal(reduce(state, { kind: 'heartbeat', at: 10_000, agentId: 'a' }), state)
})

test('a heartbeat for a running agent with a tool in flight returns the same state', () => {
  const state = run([
    { kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' },
    TOOL(1, 't1', 'a'),
  ])
  assert.equal(reduce(state, { kind: 'heartbeat', at: 500_000, agentId: 'a' }), state)
})

test('a heartbeat for a running agent silent for 30 s refreshes its signal', () => {
  const state = run([{ kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' }])
  const next = reduce(state, { kind: 'heartbeat', at: 30_000, agentId: 'a' })
  assert.equal(next.agents.a.lastSignal, 30_000)
})

test('a tick that marks nothing unknown returns the same state', () => {
  const state = run([{ kind: 'agent.start', at: 0, id: 'a', type: 'x', description: '' }])
  assert.equal(reduce(state, { kind: 'tick', at: 5_000 }), state)
})

test('a fresh session has unknown billing', () => {
  assert.deepEqual(initialState('s1', 0).billing, { kind: 'unknown' })
})

test('a billing event sets the billing', () => {
  const plan = { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 71 }] } as const
  assert.deepEqual(run([{ kind: 'billing', at: 1, billing: plan }]).billing, plan)
})

test('a billing event with the same value returns the same state', () => {
  const plan = { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 71 }] } as const
  const once = run([{ kind: 'billing', at: 1, billing: plan }])
  assert.equal(reduce(once, { kind: 'billing', at: 2, billing: { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 71 }] } }), once)
  assert.notEqual(reduce(once, { kind: 'billing', at: 2, billing: { kind: 'api' } }), once)
})
