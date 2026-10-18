import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentEvent } from '../../src/core/model'
import { appendBounded } from '../../src/mod/event-batch'

const tick = (at: number): AgentEvent => ({ kind: 'tick', at })

test('appendBounded keeps order and adds new events last', () => {
  assert.deepEqual(appendBounded([tick(1)], [tick(2), tick(3)], 10), [tick(1), tick(2), tick(3)])
})

test('appendBounded drops the oldest events past the limit', () => {
  assert.deepEqual(appendBounded([tick(1), tick(2)], [tick(3), tick(4)], 3), [tick(2), tick(3), tick(4)])
})
