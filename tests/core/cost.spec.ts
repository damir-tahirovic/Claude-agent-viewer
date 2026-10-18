import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costOf, isExpensive, PRICES } from '../../src/core/cost'

test('cost uses per-MTok prices for every token bucket', () => {
  const price = PRICES['sonnet-5-5']
  const everyBucket = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 }
  const cost = costOf('claude-sonnet-5-5', everyBucket)
  assert.equal(cost, price.input + price.output + price.cacheRead + price.cacheWrite)
})

test('an unknown model costs nothing', () => {
  assert.equal(costOf('mystery', { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }), 0)
})

test('a dated model id matches its short id by prefix', () => {
  const tokens = { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }
  assert.equal(costOf('claude-sonnet-5-5-20261001', tokens), 2)
})

test('isExpensive: $0.50 or more is expensive on its own', () => {
  assert.equal(isExpensive(0.5, 10, 1), true)
})

test('isExpensive: a lone agent with no cost is not expensive', () => {
  assert.equal(isExpensive(0, 0, 0), false)
  assert.equal(isExpensive(0.04, 0.04, 1), false)
})

test('isExpensive: the share rule needs a non-trivial cost and a second agent with cost', () => {
  assert.equal(isExpensive(0.06, 0.08, 2), true)
  assert.equal(isExpensive(0.04, 0.05, 2), false)
  assert.equal(isExpensive(0.06, 0.06, 1), false)
})
