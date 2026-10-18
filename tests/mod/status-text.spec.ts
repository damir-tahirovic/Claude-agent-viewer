import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AgentEvent } from '../../src/core/model'
import { initialState, reduce } from '../../src/core/reducer'
import { statusFor } from '../../src/mod/status-text'

const AT = 1_700_000_000_000
const fold = (events: AgentEvent[]) => events.reduce(reduce, initialState('s', AT))

test('a session with only main shows the running count and the hint during a turn', () => {
  const state = fold([{ kind: 'turn', at: AT, agentId: 'main', phase: 'start' }])
  assert.match(statusFor(state, AT), /^⠋ 1 running · 0 tok · —   \/agentview$/)
})

test('a fresh session at the prompt counts no running agent', () => {
  assert.match(statusFor(initialState('s', AT), AT), /^⠋ 0 running · 0 tok · —   \/agentview$/)
})

test('a silent subagent past 60 s is counted unknown, not running, and never done', () => {
  const state = fold([
    { kind: 'turn', at: AT, agentId: 'main', phase: 'start' },
    { kind: 'agent.start', id: 'a', type: 'worker', description: 'x', at: AT },
    { kind: 'tick', at: AT + 61_000 },
  ])
  assert.equal(state.agents.a.status, 'unknown')
  assert.match(statusFor(state, AT + 61_000), /^⠋ 1 running/)
})

test('the same state at the same time gives the same text', () => {
  const state = initialState('s', AT)
  assert.equal(statusFor(state, AT), statusFor(state, AT))
})

test('the all-done line shows cost on API billing and leaves it out on a subscription', () => {
  const done: AgentEvent[] = [
    { kind: 'todos', at: AT, agentId: 'main', todos: [{ content: 'x', status: 'completed' }] },
    { kind: 'agent.start', id: 'a', type: 'worker', description: 'x', at: AT },
    { kind: 'usage', at: AT, agentId: 'a', model: 'claude-opus-5-5', tokens: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 } },
    { kind: 'agent.end', id: 'a', ok: true, at: AT },
  ]
  const api = fold([...done, { kind: 'billing', at: AT, billing: { kind: 'api' } }])
  const plan = fold([...done, { kind: 'billing', at: AT, billing: { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 71 }] } }])
  const unknown = fold(done)
  assert.match(statusFor(api, AT), /^✓ all 2 agents done · 1000k tok · ~\$\d/)
  for (const state of [plan, unknown]) assert.doesNotMatch(statusFor(state, AT), /~\$/)
  assert.match(statusFor(plan, AT), /^✓ all 2 agents done · .* tok · 100%$/)
})
