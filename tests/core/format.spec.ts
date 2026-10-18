import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtK, fmtT, fmtCost, shortModel } from '../../src/core/format'

test('fmtK keeps small numbers whole and abbreviates thousands', () => {
  assert.equal(fmtK(600), '600')
  assert.equal(fmtK(3700), '3.7k')
  assert.equal(fmtK(21500), '21.5k')
  assert.equal(fmtK(123456), '123k')
})

test('fmtT formats seconds, minutes and hours', () => {
  assert.equal(fmtT(22), '22s')
  assert.equal(fmtT(188), '3m08s')
  assert.equal(fmtT(3725), '1h02m')
})

test('fmtCost prefixes the amount with a tilde and two decimals', () => {
  assert.equal(fmtCost(0.614), '~$0.61')
  assert.equal(fmtCost(0), '~$0.00')
})

test('shortModel strips the claude prefix and the context suffix', () => {
  assert.equal(shortModel('claude-sonnet-5-5'), 'sonnet-5-5')
  assert.equal(shortModel('claude-opus-5-5[1m]'), 'opus-5-5')
  assert.equal(shortModel(undefined), '—')
})
