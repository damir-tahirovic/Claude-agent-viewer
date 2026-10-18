import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runs } from '../../src/mod/paint'

test('runs splits coded and plain text in order', () => {
  assert.deepEqual(runs('{d|│} x {IB|sel}'), [
    { codes: 'd', text: '│' },
    { codes: '', text: ' x ' },
    { codes: 'IB', text: 'sel' },
  ])
})

test('runs returns one plain run for an uncoded line', () => {
  assert.deepEqual(runs('plain'), [{ codes: '', text: 'plain' }])
})

test('runs returns nothing for an empty line', () => {
  assert.deepEqual(runs(''), [])
})
