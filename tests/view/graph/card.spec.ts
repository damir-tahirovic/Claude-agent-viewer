import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripCodes } from '../../../src/view/lines'
import { Canvas } from '../../../src/view/graph/canvas'
import { drawCard } from '../../../src/view/graph/card'
import { graphBaseRows, graphGolden } from '../../fixtures/graph-fixtures'

test('legend screen matches golden 0', () => {
  const legend = new Canvas(112, 12)
  drawCard(legend, 1, 0, 34, { ...graphBaseRows()[3], st: 'running' }, { sessionCost: 0 })
  legend.text(1, 7, 'title: name · model', 'd')
  legend.text(1, 8, 'rows: state·time / task / now /', 'd')
  legend.text(1, 9, 'tokens · cost · calls', 'd')
  const x = 40
  const edges: ReadonlyArray<readonly [string, string, string, string]> = [
    ['┃', 'c', 'running', 'heavy line, cyan'],
    ['┆', 'y', 'waiting', 'dashed, yellow'],
    ['│', 'd', 'done', 'light, dim'],
    ['┃', 'r', 'failed', 'heavy, red'],
  ]
  edges.forEach(([glyph, codes, word, description], i) =>
    legend.runs(x, i, [[glyph, codes], ['  ', ''], [word.padEnd(9), codes === 'd' ? '' : codes], [description, 'd']]))
  legend.runs(x, 4, [['├─', 'd'], ['  ', ''], ['child of a child', '']])
  legend.runs(x, 5, [['╔═╗', 'B'], ['  ', ''], ['selected node (double border + bold)', '']])
  legend.runs(x, 6, [['spawn', 'd'], ['  ', ''], ['label on the first edge: main delegated work', '']])
  legend.runs(x, 7, [['! ▲', 'y'], ['  ', ''], ['stuck > 3 min · expensive (same rules as the tree)', '']])
  legend.runs(x, 9, [['✓ done · result returned', 'g'], ['  ', ''], ['= the child finished and handed its result up', '']])
  assert.deepEqual(legend.lines(11), graphGolden('0'))
})

const cardText = (cost: number, opts: { sessionCost: number; costedAgents: number }): string => {
  const canvas = new Canvas(60, 8)
  drawCard(canvas, 0, 0, 50, { ...graphBaseRows()[3], cost, st: 'running' }, opts)
  return canvas.lines(8).map(stripCodes).join('\n')
}

test('a card of a lone agent costing $0.00 shows no expensive mark', () => {
  assert.ok(!cardText(0, { sessionCost: 0, costedAgents: 0 }).includes('▲'))
})

test('a card holding the larger part of two costed agents shows the mark', () => {
  assert.ok(cardText(0.06, { sessionCost: 0.08, costedAgents: 2 }).includes('▲'))
})

test('a card off API billing leaves out the cost segment and the mark', () => {
  for (const billing of [{ kind: 'unknown' }, { kind: 'subscription', limits: [] }] as const) {
    const canvas = new Canvas(60, 8)
    drawCard(canvas, 0, 0, 50, { ...graphBaseRows()[3], cost: 0.9, st: 'running' }, { sessionCost: 0.9, costedAgents: 2, billing })
    const text = canvas.lines(8).map(stripCodes).join('\n')
    assert.ok(!text.includes('~$') && !text.includes('▲'))
    assert.ok(text.includes(' tok · 24 calls'))
  }
})

const progressCardText = (prog: { done: number; total: number } | undefined, isMain = false): string => {
  const canvas = new Canvas(60, 8)
  drawCard(canvas, 0, 0, 50, { ...graphBaseRows()[3], st: 'running', ...(prog ? { prog } : {}) }, { sessionCost: 0.5, isMain })
  return canvas.lines(8).map(stripCodes).join('\n')
}

test('a card with a todo list appends its progress to the tokens line', () => {
  assert.match(progressCardText({ done: 3, total: 5 }), /24 calls · 3\/5/)
})

test('a card without a list is unchanged', () => {
  assert.doesNotMatch(progressCardText(undefined), /calls · \d+\/\d+/)
  assert.doesNotMatch(progressCardText({ done: 1, total: 2 }, true), /calls · \d+\/\d+/)
})

test('a card whose tokens line is full puts the progress on the status line', () => {
  const canvas = new Canvas(40, 8)
  drawCard(canvas, 0, 0, 34, { ...graphBaseRows()[3], st: 'running', prog: { done: 3, total: 5 } },
    { sessionCost: 0.5, isRich: true })
  const text = canvas.lines(8).map(stripCodes)
  assert.ok(text.some(line => line.includes('3/5')))
  assert.ok(!text[5].includes('3/5'))
})
