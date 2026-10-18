import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reduce, initialState } from '../../src/core/reducer'
import { buildPaneView } from '../../src/mod/pane-view'
import { stripCodes, visibleLength } from '../../src/view/lines'

const NOW = 1_700_000_000_000
const base = {
  view: 'tree' as const, selId: 'main', spin: 0, now: NOW, columns: 100, rows: 30, ascii: false,
}
const twoAgents = reduce(initialState('abcdef123456', NOW), {
  kind: 'agent.start', id: 'a1', parentId: 'main', type: 'worker', description: 'fix bug', at: NOW,
})

test('tree view has a header, one line per agent and the hints in the tail', () => {
  const view = buildPaneView({ ...base, session: twoAgents })
  assert.match(stripCodes(view.head[0]), /^agentview · session abcdef12/)
  assert.deepEqual(view.agentLines.map(entry => entry.id), ['main', 'a1'])
  assert.match(stripCodes(view.tail.join('\n')), /esc close/)
})

test('a lone main agent gets the no-subagents line', () => {
  const view = buildPaneView({ ...base, session: initialState('s', NOW) })
  assert.match(stripCodes(view.tail.join('\n')), /no subagents yet/)
})

test('detail view shows the TASK section of the selected agent', () => {
  const view = buildPaneView({ ...base, session: twoAgents, view: 'detail', selId: 'a1' })
  assert.match(stripCodes(view.head.join('\n')), /TASK/)
  assert.equal(view.agentLines.length, 0)
})

test('no line is wider than the body, including the no-subagents line', () => {
  for (const columns of [50, 59, 60, 79]) {
    const view = buildPaneView({ ...base, columns, session: initialState('s', NOW) })
    const all = [...view.head, ...view.agentLines.map(entry => entry.line), ...view.tail]
    all.forEach(line => assert.ok(visibleLength(line) <= columns, `${columns}: ${stripCodes(line)}`))
  }
})
