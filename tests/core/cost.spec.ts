import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costOf, PRICES } from '../../src/core/cost'

test('cost uses per-MTok prices for every token bucket', () => {
  const price = PRICES['sonnet-5-5']
  const everyBucket = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 }
  const cost = costOf('claude-sonnet-5-5', everyBucket)
  assert.equal(cost, price.input + price.output + price.cacheRead + price.cacheWrite)
})

test('an unknown model costs nothing', () => {
  assert.equal(costOf('mystery', { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }), 0)
})
