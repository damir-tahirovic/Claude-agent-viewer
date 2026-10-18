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
