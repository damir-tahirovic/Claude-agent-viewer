import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripCodes } from '../../../src/view/lines'
import { frameGraph } from '../../../src/view/graph/frame'
import { graphBaseRows } from '../../fixtures/graph-fixtures'

test('the graph header total gets a plus only when a partial-output agent is included', () => {
  const rows = graphBaseRows()
  const header = (list: typeof rows): string => stripCodes(frameGraph(100, { rows: list }, () => 2)[0])
  assert.doesNotMatch(header(rows), /k\+ tok/)
  assert.match(header([{ ...rows[0], o: 0, outputPartial: 1 }, ...rows.slice(1)]), /\+ tok/)
})
