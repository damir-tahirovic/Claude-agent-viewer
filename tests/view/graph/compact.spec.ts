import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripCodes, visibleLength } from '../../../src/view/lines'
import { buildGraphLines, graphColumnsFor } from '../../../src/view/graph/pane'
import type { GraphLinesOpts } from '../../../src/view/graph/pane'
import type { Row } from '../../../src/view/rows'
import { graphBaseRows, graphPlan } from '../../fixtures/graph-fixtures'

const row = (id: string, d: number, name: string, st: Row['st'] = 'running'): Row => ({
  id, d, name, task: 'task of ' + id, model: 'sonnet-5-5', st, act: 'Edit a.ts', i: 1000, o: 200, cr: 0, cw: 0,
  calls: 3, secs: 72, cost: 0.01,
})

/** Main plus `workers` top-level workers (named w0..), with nested scouts under the first three. */
const manyRows = (workers: number, nested = 3): Row[] => {
  const rows = [row('main', 0, 'main')]
  for (let index = 0; index < workers; index++) {
    rows.push(row(`w${index}`, 1, `wrk${index}`))
    if (index < nested) rows.push(row(`s${index}`, 2, `sct${index}`, 'done'))
  }
  return rows
}

const linesOf = (rows: Row[], columns: number, extra: Partial<GraphLinesOpts> = {}) => buildGraphLines({
  rows, selectedId: 'main', graphCol: 0, plan: graphPlan, sessionId: 'abcd1234', spin: '⠋', columns,
  paneRows: 200, chromeLines: 3, ascii: false, ...extra,
})
const plain = (lines: ReadonlyArray<string>): string => lines.map(stripCodes).join('\n')

test('auto picks compact cards when twelve workers do not fit full at 200 columns', () => {
  const graph = linesOf(manyRows(12), 200)
  const text = plain(graph.lines)
  for (let index = 0; index < 12; index++) assert.ok(text.includes(`wrk${index}`), `wrk${index} missing`)
  assert.equal(graph.hiddenColumns, undefined)
  assert.ok(!text.includes('task of w1'), 'compact cards carry no task line')
  assert.match(text, /run +1m12s/)
})

test('auto keeps every worker visible at 120 columns as far as 14-wide columns allow', () => {
  const graph = linesOf(manyRows(6), 120)
  assert.equal(graph.hiddenColumns, undefined)
  const text = plain(graph.lines)
  for (let index = 0; index < 6; index++) assert.ok(text.includes(`wrk${index}`), `wrk${index} missing`)
  assert.ok(!text.includes('workers 1'))
})

test('auto pans compact columns when even 14-wide columns do not fit', () => {
  const graph = linesOf(manyRows(12), 120)
  assert.deepEqual(graph.hiddenColumns, { total: 12, visible: 6, first: 0 })
  assert.match(plain(graph.lines.concat(graph.hint)), /workers 1–6 of 12/)
})

test('three workers at 200 columns stay full and identical to the forced full density', () => {
  const rows = graphBaseRows()
  const auto = linesOf(rows, 200)
  const full = linesOf(rows, 200, { density: 'full' })
  assert.deepEqual(auto, full)
  assert.match(plain(auto.lines), /fix login bug/)
})

test('auto falls to compact when full cards fit the width but not the height', () => {
  const rows = manyRows(3, 3)
  const tall = linesOf(rows, 200, { paneRows: 14 })
  assert.ok(!plain(tall.lines).includes('task of w1'))
  assert.ok(tall.lines.length + 3 <= 14, 'compact cards bring the graph into the pane')
})

test('forced full density keeps the old panning', () => {
  const graph = linesOf(manyRows(12), 200, { density: 'full' })
  assert.equal(graph.hiddenColumns?.visible, 4)
})

test('forced compact density applies even to few workers', () => {
  const graph = linesOf(graphBaseRows(), 200, { density: 'compact' })
  assert.ok(!plain(graph.lines).includes('fix login bug'))
})

test('the selected worker is drawn as a full card inside a compact graph', () => {
  const graph = linesOf(manyRows(12), 200, { selectedId: 'w5' })
  const text = plain(graph.lines)
  assert.match(text, /╔═ wrk5/)
  assert.ok(text.includes('task of w5'))
  assert.ok(!text.includes('task of w6'))
})

test('a selected nested agent is drawn full too', () => {
  const text = plain(linesOf(manyRows(12), 200, { selectedId: 's1' }).lines)
  assert.match(text, /╔═ sct1/)
  assert.ok(text.includes('task of s1'))
})

test('compact graph lines never exceed the pane width', () => {
  for (const columns of [110, 120, 160, 200]) {
    for (const selectedId of ['main', 'w0', 'w11', 's2']) {
      const graph = linesOf(manyRows(12), columns, { selectedId, graphCol: 3 })
      for (const line of graph.lines) assert.ok(visibleLength(line) <= columns, `${columns}/${selectedId}: ${stripCodes(line)}`)
    }
  }
})

test('compact graph in ascii has no box-drawing glyphs', () => {
  const text = plain(linesOf(manyRows(12), 200, { ascii: true, spin: '*' }).lines)
  assert.doesNotMatch(text, /[╭╮╰╯│─┃┆╔╗╚╝═✓✗◔⠋]/)
  assert.match(text, /\+-/)
})

test('compact chips fold finished subtrees when the height still overflows', () => {
  const rows = manyRows(12).map(each => (['w0', 's0'].includes(each.id) ? { ...each, st: 'done' as const } : each))
  const unfolded = linesOf(rows, 200)
  const folded = linesOf(rows, 200, { paneRows: unfolded.lines.length + 3 - 2 })
  assert.ok(folded.lines.length < unfolded.lines.length)
  assert.match(plain(folded.lines), /✓ wrk0 \+1/)
})

test('graphColumnsFor follows the density', () => {
  const outline = manyRows(6).map(({ d }) => ({ d }))
  assert.equal(graphColumnsFor(outline, 120), undefined)
  assert.deepEqual(graphColumnsFor(outline, 120, 'full'), { visible: 2 })
  assert.deepEqual(graphColumnsFor(manyRows(12).map(({ d }) => ({ d })), 120), { visible: 6 })
})
