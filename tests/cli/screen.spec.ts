import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffScreen, fullScreen } from '../../src/cli/screen'

test('equal screens give an empty string', () => {
  assert.equal(diffScreen(['a', 'b'], ['a', 'b'], 10), '')
})

test('one changed line writes only that row', () => {
  assert.equal(diffScreen(['a', 'b', 'c'], ['a', 'X', 'c'], 10), '\x1b[2;1HX\x1b[K')
})

test('shrinking clears the rows that disappeared', () => {
  assert.equal(diffScreen(['a', 'b', 'c'], ['a'], 10), '\x1b[2;1H\x1b[K\x1b[3;1H\x1b[K')
})

test('growing writes the new rows', () => {
  assert.equal(diffScreen(['a'], ['a', 'b'], 10), '\x1b[2;1Hb\x1b[K')
})

test('lines beyond rows are never written', () => {
  assert.equal(diffScreen([], ['a', 'b', 'c'], 2), '\x1b[1;1Ha\x1b[K\x1b[2;1Hb\x1b[K')
})

test('rows beyond the screen are not cleared', () => {
  assert.equal(diffScreen(['a', 'b', 'c'], [], 1), '\x1b[1;1H\x1b[K')
})

test('fullScreen clears first then writes every row', () => {
  assert.equal(fullScreen(['a', 'b'], 5), '\x1b[H\x1b[2J\x1b[1;1Ha\x1b[K\x1b[2;1Hb\x1b[K')
})
