import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGraphTree } from '../../../src/view/graph/layout'
import { renderGraph } from '../../../src/view/graph/render'
import {
  graphBaseRows, graphEmptyRows, graphEndedRows, graphFailedRows, graphGolden, graphManyAgents, graphPlan,
} from '../../fixtures/graph-fixtures'

const base = graphBaseRows()

test('graph at 160 columns matches golden 1', () => {
  const lines = renderGraph({ width: 160, tree: buildGraphTree(base), selectedId: 'g3', plan: graphPlan })
  assert.deepEqual(lines, graphGolden('1'))
})

test('graph at 120 columns with a stuck note matches golden 2', () => {
  const lines = renderGraph({
    width: 120, tree: buildGraphTree(base), selectedId: 'g3', plan: graphPlan,
    note: [['! ', 'y'], ['write auth tests', ''], [' has been on "npm test" for 4m10s', 'd']],
  })
  assert.deepEqual(lines, graphGolden('2'))
})

test('ascii fallback matches golden 4', () => {
  const lines = renderGraph({ width: 120, tree: buildGraphTree(base), selectedId: 'g3', plan: graphPlan, ascii: true })
  assert.deepEqual(lines, graphGolden('4'))
})

test('main alone with a stub and no plan matches golden 5a', () => {
  const rows = graphEmptyRows()
  const lines = renderGraph({ width: 120, tree: buildGraphTree(rows), selectedId: 'e0', plan: null })
  // The generator marks this lone $0.04 agent with ▲; v0.2.2 drops the mark for a single agent under $0.05
  // (the share rule needs a second agent with cost), so only that segment differs from the golden file.
  const expected = graphGolden('5a').map(line =>
    line.replace('{d|2.5k tok · }{yB|~$0.04▲}{d| · 3 calls}', '{d|2.5k tok · ~$0.04 · 3 calls} '))
  assert.notDeepEqual(expected, graphGolden('5a'))
  assert.deepEqual(lines, expected)
})

test('waiting for permission matches golden 5b', () => {
  // The generator selects `base()[5]`, a fresh object that never matches a node, so the golden has no selection.
  const lines = renderGraph({
    width: 120, tree: buildGraphTree(base), plan: graphPlan,
    note: [
      ['◔ ', 'y'], ['reviewer', 'yB'], [' is waiting for permission: ', ''], ['Bash: rm -rf dist', 'y'],
      [' · answer in the Claude Code prompt · 1m35s', 'd'],
    ],
  })
  assert.deepEqual(lines, graphGolden('5b'))
})

test('failed subagent matches golden 5c', () => {
  const lines = renderGraph({
    width: 120, tree: buildGraphTree(graphFailedRows()), selectedId: 'g6', plan: graphPlan,
    note: [['✗ ', 'rB'], ['write auth tests', 'r'], [' failed · Bash: npm test exited 1 after 4m10s · ⏎ for output', 'd']],
  })
  assert.deepEqual(lines, graphGolden('5c'))
})

test('sixteen agents with collapsed chips and a column window match golden 5d', () => {
  const { rows, collapsedIds } = graphManyAgents()
  const selected = rows.find(row => row.task === 'port tests to vitest')
  const lines = renderGraph({
    width: 160, tree: buildGraphTree(rows, collapsedIds), selectedId: selected?.id, plan: graphPlan,
    columns: 4, firstColumn: 0, middle: '◂ workers 1–4 of 7 ▸',
    note: [['16 agents · 9 done subtrees collapsed · ', 'd'], ['▸ 3 more workers →', 'B']],
  })
  assert.deepEqual(lines, graphGolden('5d'))
})

test('finished session matches golden 5e', () => {
  const lines = renderGraph({
    width: 120, tree: buildGraphTree(graphEndedRows()), selectedId: 'g0', ended: '14m22s',
    plan: { done: 10, total: 10, cur: 'all todos complete' },
    note: [['✓ ', 'g'], ['Finished in 14m22s — nothing is running', '']],
  })
  assert.deepEqual(lines, graphGolden('5e'))
})

test('wide graph shows a custom waiting text instead of the default', () => {
  const text = renderGraph({
    width: 120, tree: buildGraphTree(base), selectedId: 'g5', plan: graphPlan, waitingText: '◔ needs your OK',
  }).join('\n')
  assert.ok(text.includes('needs your OK'))
  assert.ok(!text.includes('waiting for permission'))
})
