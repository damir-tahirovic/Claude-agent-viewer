import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billingEvent, toolStart, toolEnd, spawnStart, stepUsage, listStatus, turnComplete, turnStart } from '../../src/mod/adapter'

test('tool start in main and in a subagent', () => {
  assert.deepEqual(toolStart({ tool: 'Read', tool_use_id: 't', file_path: 'a' }, 1)[0], {
    kind: 'tool.start',
    at: 1,
    agentId: 'main',
    toolUseId: 't',
    tool: 'Read',
    input: { tool: 'Read', tool_use_id: 't', file_path: 'a' },
  })
  const [inSub] = toolStart({ tool: 'Read', tool_use_id: 't', agentId: 'a1' }, 1)
  assert.equal(inSub?.kind === 'tool.start' && inSub.agentId, 'a1')
})

test('TodoWrite also emits todos', () => {
  const events = toolStart({ tool: 'TodoWrite', tool_use_id: 't', todos: [{ content: 'x', status: 'pending' }] }, 1)
  assert.deepEqual(events.map(event => event.kind), ['tool.start', 'todos'])
})

test('TodoWrite with malformed todos emits only tool.start', () => {
  const events = toolStart({ tool: 'TodoWrite', tool_use_id: 't', todos: 'nope' }, 1)
  assert.deepEqual(events.map(event => event.kind), ['tool.start'])
})

test('Agent tool start emits only tool.start', () => {
  assert.equal(toolStart({ tool: 'Agent', tool_use_id: 't' }, 1).length, 1)
})

test('errors and denies are not ok', () => {
  const [errored] = toolEnd({ tool: 'Bash', tool_use_id: 't' }, { isError: true }, 2)
  const [denied] = toolEnd({ tool: 'Bash', tool_use_id: 't' }, { deny: 'no' }, 2)
  const [fine] = toolEnd({ tool: 'Bash', tool_use_id: 't' }, {}, 2)
  assert.equal(errored?.kind === 'tool.end' && errored.ok, false)
  assert.equal(denied?.kind === 'tool.end' && denied.ok, false)
  assert.equal(fine?.kind === 'tool.end' && fine.ok, true)
})

test('foreground Agent result ends the subagent', () => {
  const events = toolEnd({ tool: 'Agent', tool_use_id: 't' }, { result: { status: 'completed', agentId: 'a1' } }, 5)
  assert.deepEqual(events[1], { kind: 'agent.end', at: 5, id: 'a1', ok: true })
})

test('background Agent result does not end the subagent', () => {
  const events = toolEnd(
    { tool: 'Task', tool_use_id: 't' },
    { result: { status: 'async_launched', agentId: 'a1' } },
    5,
  )
  assert.deepEqual(events.map(event => event.kind), ['tool.end'])
})

test('only a completed Agent result ends the subagent', () => {
  for (const status of ['async_launched', 'remote_launched', 'teammate_spawned', undefined]) {
    const events = toolEnd({ tool: 'Agent', tool_use_id: 't' }, { result: { status, agentId: 'a1' } }, 5)
    assert.deepEqual(events.map(event => event.kind), ['tool.end'], String(status))
  }
})

test('spawn without an id emits nothing', () => {
  assert.deepEqual(spawnStart({ subagentType: 'Explore' }, {}, 1), [])
})

test('spawn defaults parent to main', () => {
  assert.deepEqual(spawnStart({ subagentType: 'Explore', description: 'd' }, { agentId: 'a1', model: 'm' }, 1), [
    { kind: 'agent.start', at: 1, id: 'a1', parentId: 'main', type: 'Explore', description: 'd', model: 'm' },
  ])
})

test('usage maps API field names', () => {
  const [usage] = stepUsage(
    { model: 'claude-opus-5-5' },
    { input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 1, cache_creation_input_tokens: 0, model: 'x' },
    3,
  )
  assert.deepEqual(usage, {
    kind: 'usage',
    at: 3,
    agentId: 'main',
    model: 'x',
    tokens: { input: 5, output: 2, cacheRead: 1, cacheWrite: 0 },
  })
})

test('usage is empty when null', () => {
  assert.deepEqual(stepUsage({ model: 'm' }, null, 1), [])
})

test('list status transitions emit once', () => {
  const known: Record<string, string> = {}
  assert.equal(listStatus([{ id: 'a', status: 'completed' }], 1, known).length, 1)
  known.a = 'completed'
  assert.equal(listStatus([{ id: 'a', status: 'completed' }], 2, known).length, 0)
})

test('list status maps failed, killed and waiting', () => {
  const events = listStatus(
    [{ id: 'a', status: 'failed' }, { id: 'b', status: 'killed' }, { id: 'c', status: 'waiting' }, { id: 'd', status: 'running' }],
    1,
    {},
  )
  assert.deepEqual(events, [
    { kind: 'agent.end', at: 1, id: 'a', ok: false },
    { kind: 'agent.end', at: 1, id: 'b', ok: false },
    { kind: 'waiting', at: 1, agentId: 'c' },
    { kind: 'heartbeat', at: 1, agentId: 'd' },
  ])
})

test('every poll heartbeats a running agent, even when its status did not change', () => {
  const known = { a: 'running' }
  assert.deepEqual(listStatus([{ id: 'a', status: 'running' }], 2, known), [{ kind: 'heartbeat', at: 2, agentId: 'a' }])
})

test('turn start of main maps to a main turn start; a subagent turn start maps to nothing', () => {
  assert.deepEqual(turnStart({}, 7), [{ kind: 'turn', at: 7, agentId: 'main', phase: 'start' }])
  assert.deepEqual(turnStart({ agentId: 'a1' }, 7), [])
})

test('turn complete ends subagents; main turn complete ends main\'s turn', () => {
  assert.deepEqual(turnComplete({ agentId: 'a1', isAborted: false }, 4), [{ kind: 'agent.end', at: 4, id: 'a1', ok: true }])
  assert.deepEqual(turnComplete({ agentId: 'a1', isAborted: true }, 4), [{ kind: 'agent.end', at: 4, id: 'a1', ok: false }])
  assert.deepEqual(turnComplete({ isAborted: false }, 4), [{ kind: 'turn', at: 4, agentId: 'main', phase: 'end' }])
})

test('rate limits in the usage mean a subscription, keeping kind and percent only', () => {
  const usage = { rateLimits: [
    { kind: 'five_hour', percentUsed: 71, resetsAt: '2026-10-18T12:00:00Z' },
    { kind: 'seven_day', percentUsed: 21 },
  ] }
  assert.deepEqual(billingEvent(usage, false, 5), [{
    kind: 'billing', at: 5,
    billing: { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 71 }, { kind: 'seven_day', percentUsed: 21 }] },
  }])
})

test('no rate limits mean API billing after a completed turn and unknown before one', () => {
  assert.deepEqual(billingEvent({ rateLimits: [] }, true, 5), [{ kind: 'billing', at: 5, billing: { kind: 'api' } }])
  assert.deepEqual(billingEvent({ rateLimits: [] }, false, 5), [{ kind: 'billing', at: 5, billing: { kind: 'unknown' } }])
})

const created = { tool: 'TaskCreate', tool_use_id: 't', subject: 'write tests', agentId: 'a1' }

test('a finished TaskCreate adds the task under the engine id, in the calling agent', () => {
  const events = toolEnd(created, { result: { task: { id: '7', subject: 'write tests' } } }, 1)
  assert.deepEqual(events[1], { kind: 'task.add', at: 1, agentId: 'a1', id: '7', content: 'write tests' })
})

test('a failed or id-less TaskCreate adds nothing', () => {
  assert.equal(toolEnd(created, { isError: true, result: { task: { id: '7' } } }, 1).length, 1)
  assert.equal(toolEnd(created, { result: {} }, 1).length, 1)
})

test('a successful TaskUpdate with a status sets it; a failed one or a status-less one does not', () => {
  const update = { tool: 'TaskUpdate', tool_use_id: 't', taskId: '7', status: 'completed' }
  assert.deepEqual(toolEnd(update, { result: { success: true } }, 2)[1], { kind: 'task.set', at: 2, id: '7', status: 'completed' })
  assert.equal(toolEnd(update, { result: { success: false } }, 2).length, 1)
  assert.equal(toolEnd({ ...update, status: undefined }, { result: { success: true } }, 2).length, 1)
  assert.equal(toolEnd({ ...update, status: 'bogus' }, { result: { success: true } }, 2).length, 1)
})
