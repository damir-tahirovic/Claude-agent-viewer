import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphColumnsFor } from '../../src/mod/graph-pane'

const workers = (count: number) => [
  { d: 0 }, ...Array.from({ length: count }, () => ({ d: 1 })),
]

test('graphColumnsFor is undefined below the wide threshold', () => {
  assert.equal(graphColumnsFor(workers(5), 109), undefined)
})

test('graphColumnsFor is undefined when every worker column fits', () => {
  assert.equal(graphColumnsFor(workers(3), 160), undefined)
})

test('graphColumnsFor gives the visible column count when workers overflow', () => {
  assert.deepEqual(graphColumnsFor(workers(3), 110), { visible: 2 })
  assert.deepEqual(graphColumnsFor(workers(9), 160), { visible: 3 })
})

test('graphColumnsFor counts only depth-1 rows as worker columns', () => {
  assert.equal(graphColumnsFor([{ d: 0 }, { d: 1 }, { d: 2 }, { d: 2 }], 110), undefined)
})
