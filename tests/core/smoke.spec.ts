import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GOLDEN } from '../../src/view/spec-golden'

test('golden fixtures load', () => {
  assert.ok(GOLDEN['1a'].length > 10)
})
