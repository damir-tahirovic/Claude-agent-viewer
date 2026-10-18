import { test } from 'node:test'
import assert from 'node:assert/strict'
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
