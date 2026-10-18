import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createViewMemo } from '../../src/mod/view-memo'

const key = { session: {}, view: 'tree', selId: 'main', mode: 'tree', graphCol: 0, spin: 0, win: undefined,
  columns: 100, rows: 30, ascii: false, second: 5 }

test('the memo builds once for an unchanged key', () => {
  let builds = 0
  const memo = createViewMemo<number>()
  const build = () => ++builds
  assert.equal(memo(key, build), 1)
  assert.equal(memo({ ...key }, build), 1)
  assert.equal(builds, 1)
})

test('the memo rebuilds when the session object, the second or the window changes', () => {
  let builds = 0
  const memo = createViewMemo<number>()
  const build = () => ++builds
  memo(key, build)
  memo({ ...key, session: {} }, build)
  memo({ ...key, session: key.session, second: 6 }, build)
  memo({ ...key, session: key.session, second: 6, win: [0, 5] as const }, build)
  assert.equal(builds, 4)
})
