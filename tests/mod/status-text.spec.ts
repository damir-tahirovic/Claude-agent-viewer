import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AgentEvent } from '../../src/core/model'
import { initialState, reduce } from '../../src/core/reducer'
import { statusFor } from '../../src/mod/status-text'

const AT = 1_700_000_000_000
const fold = (events: AgentEvent[]) => events.reduce(reduce, initialState('s', AT))

test('a session with only main still shows the running count and the hint', () => {
  assert.match(statusFor(initialState('s', AT), AT), /^⠋ 1 running · 0 tok · —   \/agentview$/)
})

test('a silent subagent past 60 s is counted unknown, not running, and never done', () => {
  const state = fold([
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
