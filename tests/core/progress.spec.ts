import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planOf, progressOf, progressPercent } from '../../src/core/progress'

test('no todo list gives null, shown as a dash', () => {
  assert.equal(planOf(undefined), null)
  assert.equal(planOf([]), null)
})

test('done and total count, current item is the in-progress one', () => {
  const todos = [
    { content: 'a', status: 'completed' },
    { content: 'b', status: 'in_progress' },
    { content: 'c', status: 'pending' },
  ] as const
  assert.deepEqual(planOf(todos), { done: 1, total: 3, cur: 'b' })
})

test('without in-progress the first pending is current; all done gives the last item', () => {
  assert.equal(planOf([{ content: 'a', status: 'completed' }, { content: 'b', status: 'pending' }])?.cur, 'b')
  assert.equal(planOf([{ content: 'a', status: 'completed' }])?.cur, 'a')
})

test('progressOf gives done and total, or null without a list', () => {
  assert.equal(progressOf(undefined), null)
  assert.equal(progressOf([]), null)
  assert.deepEqual(progressOf([{ content: 'a', status: 'completed' }, { content: 'b', status: 'pending' }]), { done: 1, total: 2 })
})

test('progressPercent rounds done over total', () => {
  assert.equal(progressPercent({ done: 3, total: 5 }), 60)
  assert.equal(progressPercent({ done: 1, total: 3 }), 33)
})
