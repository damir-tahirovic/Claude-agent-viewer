import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideClose, stepId } from '../../src/mod/pane-keys'

test('person Esc in detail goes back', () => assert.equal(decideClose('detail', true, true), 'back'))
test('Esc in the tree closes', () => assert.equal(decideClose('tree', true, true), 'close'))
test('a plugin close in detail still closes', () => assert.equal(decideClose('detail', true, false), 'close'))
test('another pane passes', () => assert.equal(decideClose('detail', false, true), 'pass'))

const order = ['main', 'b', 'a']
test('stepId follows the given order', () => assert.equal(stepId(order, 'main', 1), 'b'))
test('stepId wraps backwards', () => assert.equal(stepId(order, 'main', -1), 'a'))
test('stepId wraps forwards', () => assert.equal(stepId(order, 'a', 1), 'main'))
test('stepId on an unknown id starts from the first', () => assert.equal(stepId(order, 'zz', 1), 'b'))
test('stepId on an empty order keeps the id', () => assert.equal(stepId([], 'x', 1), 'x'))

import { nextWindow } from '../../src/mod/pane-keys'

const many = Array.from({ length: 20 }, (_, i) => 'a' + i)
test('nextWindow shows everything when the rows fit', () => assert.deepEqual(nextWindow(many.slice(0, 5), 'a1', [0, 5], 8), [0, 5]))
test('nextWindow leaves a middle focus alone', () => assert.deepEqual(nextWindow(many, 'a4', [0, 8], 8), [0, 8]))
test('nextWindow shifts down by one on the last visible row', () => assert.deepEqual(nextWindow(many, 'a7', [0, 8], 8), [1, 9]))
test('nextWindow shifts up by one on the first visible row', () => assert.deepEqual(nextWindow(many, 'a5', [5, 13], 8), [4, 12]))
test('nextWindow does not shift above the first row', () => assert.deepEqual(nextWindow(many, 'a0', [0, 8], 8), [0, 8]))
test('nextWindow does not shift below the last row', () => assert.deepEqual(nextWindow(many, 'a19', [12, 20], 8), [12, 20]))
test('nextWindow clamps a stale window', () => assert.deepEqual(nextWindow(many, 'a15', [30, 38], 8), [12, 20]))
test('nextWindow brings an outside focus into view', () => assert.deepEqual(nextWindow(many, 'a10', [0, 8], 8), [3, 11]))

import { panColumn, panToInclude } from '../../src/mod/graph-pane'

const columns = { total: 5, visible: 2, first: 0 }
test('panColumn moves by one worker column', () => assert.equal(panColumn(1, 1, columns), 2))
test('panColumn stops at the first column', () => assert.equal(panColumn(0, -1, columns), 0))
test('panColumn stops where the last worker is the last visible column', () => assert.equal(panColumn(3, 1, columns), 3))
test('panColumn pulls a stale column back into range', () => assert.equal(panColumn(9, 0, columns), 3))

const outline = [
  { id: 'main', d: 0 }, { id: 'a', d: 1 }, { id: 'a1', d: 2 }, { id: 'b', d: 1 }, { id: 'c', d: 1 }, { id: 'c1', d: 2 },
]
test('panToInclude keeps the column when the selection is visible', () => assert.equal(panToInclude(outline, 'b', 0, 2), 0))
test('panToInclude ignores main', () => assert.equal(panToInclude(outline, 'main', 2, 1), 2))
test('panToInclude moves right just enough', () => assert.equal(panToInclude(outline, 'c', 0, 2), 1))
test('panToInclude uses the worker of a grandchild', () => assert.equal(panToInclude(outline, 'c1', 0, 1), 2))
test('panToInclude moves left to a hidden earlier worker', () => assert.equal(panToInclude(outline, 'a1', 2, 1), 0))
test('panToInclude leaves an unknown id alone', () => assert.equal(panToInclude(outline, 'zz', 1, 1), 1))
