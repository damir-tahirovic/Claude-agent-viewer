import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toAnsi } from '../../src/cli/ansi'

test('plain text passes through unchanged', () => {
  assert.equal(toAnsi('hello'), 'hello')
})

test('dim run is wrapped in SGR 2 and reset', () => {
  assert.equal(toAnsi('{d|x}'), '\x1b[2mx\x1b[0m')
})

test('each color code maps to its SGR color', () => {
  assert.equal(toAnsi('{c|a}'), '\x1b[36ma\x1b[0m')
  assert.equal(toAnsi('{y|a}'), '\x1b[33ma\x1b[0m')
  assert.equal(toAnsi('{g|a}'), '\x1b[32ma\x1b[0m')
  assert.equal(toAnsi('{r|a}'), '\x1b[31ma\x1b[0m')
  assert.equal(toAnsi('{b|a}'), '\x1b[34ma\x1b[0m')
})

test('bold and inverse codes combine', () => {
  assert.equal(toAnsi('{IB|sel}'), '\x1b[7;1msel\x1b[0m')
})

test('color and bold combine', () => {
  assert.equal(toAnsi('{rB|err}'), '\x1b[31;1merr\x1b[0m')
})

test('plain text between runs stays unstyled', () => {
  assert.equal(toAnsi('a {g|b} c'), 'a \x1b[32mb\x1b[0m c')
})

test('unknown codes produce plain text', () => {
  assert.equal(toAnsi('{z|x}'), 'x')
})
