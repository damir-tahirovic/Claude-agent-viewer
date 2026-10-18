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
