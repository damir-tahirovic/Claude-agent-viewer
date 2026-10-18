import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openArgsFor } from '../../src/mod/open-args'

test('fullscreen asks for the full terminal width', () => {
  assert.deepEqual(openArgsFor({ isFullscreen: true, columns: 180 }, 4), { columns: 180 })
})

test('the main screen asks for 30 rows when many agents need them', () => {
  assert.deepEqual(openArgsFor({ isFullscreen: false, columns: 120 }, 40), { rows: 30 })
})

test('the main screen asks for only what a few agents need', () => {
  const args = openArgsFor({ isFullscreen: false, columns: 120 }, 2)
  assert.ok(args.rows !== undefined && args.rows < 30 && args.rows >= 10)
  assert.equal(args.columns, undefined)
})

test('graph mode asks for the most inline rows, however few agents there are', () => {
  assert.deepEqual(openArgsFor({ isFullscreen: false, columns: 120 }, 2, 'graph'), { rows: 40 })
})

test('tree mode keeps the agent-count sizing', () => {
  assert.deepEqual(openArgsFor({ isFullscreen: false, columns: 120 }, 40, 'tree'), { rows: 30 })
})
