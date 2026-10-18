import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderGraphNarrow } from '../../../src/view/graph/render'
import { graphBaseRows, graphGolden, graphPlan } from '../../fixtures/graph-fixtures'

test('graph at 80 columns folds into a tree with the selected card, matching golden 3', () => {
  const rows = graphBaseRows()
  const lines = renderGraphNarrow({
    width: 80, rows, selectedId: rows[3].id, plan: graphPlan,
    hints: [['↑↓', 'select'], ['⏎', 'details'], ['tab', 'tree'], ['esc', 'close']],
  })
  assert.deepEqual(lines, graphGolden('3'))
})
