import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentEvent } from '../../src/core/model'
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

const withTodos = reduce(twoAgents, {
  kind: 'todos', at: NOW, agentId: 'main', todos: [{ content: 'step one', status: 'in_progress' }],
})

test('ascii mode leaves no character above U+007F in any line, tree or detail, at 80 and 120 columns', () => {
  for (const columns of [80, 120]) {
    for (const [view, selId] of [['tree', 'main'], ['detail', 'a1'], ['detail', 'main']] as const) {
      const built = buildPaneView({ ...base, columns, ascii: true, spin: 3, view, selId, session: withTodos })
      const all = [...built.head, ...built.agentLines.map(entry => entry.line), ...built.tail]
      all.forEach(line => assert.ok(
        [...stripCodes(line)].every(char => char.codePointAt(0)! <= 0x7f), `${view} ${columns}: ${stripCodes(line)}`,
      ))
    }
  }
})

test('no hint offers q quit in the tree or the detail view', () => {
  for (const view of ['tree', 'detail'] as const) {
    const built = buildPaneView({ ...base, view, selId: 'a1', session: twoAgents })
    assert.doesNotMatch(stripCodes([...built.head, ...built.tail].join('\n')), /q quit/)
  }
})

test('detail hints describe the prev / next buttons and esc back', () => {
  const built = buildPaneView({ ...base, view: 'detail', selId: 'a1', session: twoAgents })
  assert.match(stripCodes(built.head.join('\n')), /◂ ▸ prev \/ next\s+esc back/)
})

test('detail at 80 columns is clipped to the body and its header shows the status word', () => {
  const built = buildPaneView({ ...base, columns: 80, view: 'detail', selId: 'a1', session: twoAgents })
  built.head.forEach(line => assert.ok(visibleLength(line) <= 80, stripCodes(line)))
  assert.match(stripCodes(built.head[0]), /^agentview › worker · .* · .*running$/)
})

const crowded = Array.from({ length: 19 }, (_, i): AgentEvent => ({
  kind: 'agent.start', id: 'w' + i, type: 'worker', description: 't' + i, at: NOW + i,
})).reduce(reduce, initialState('abcdef123456', NOW))

test('20 rows in a pane with room for 8 show the stored window with more-above and more-below lines', () => {
  const built = buildPaneView({ ...base, rows: 18, selId: 'w6', win: [4, 12], session: crowded })
  assert.equal(built.agentLines.length, 8)
  assert.deepEqual(built.agentLines.map(entry => entry.id), ['w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10'])
  assert.match(stripCodes(built.head.join('\n')), /↑ 4 more above/)
  assert.match(stripCodes(built.tail.join('\n')), /↓ 8 more below/)
})

test('a stored window out of bounds is clamped', () => {
  const built = buildPaneView({ ...base, rows: 18, selId: 'w18', win: [99, 107], session: crowded })
  assert.deepEqual(built.agentLines.map(entry => entry.id).slice(-1), ['w18'])
  assert.equal(built.agentLines.length, 8)
  assert.doesNotMatch(stripCodes(built.tail.join('\n')), /more below/)
})

test('without a stored window the selection decides', () => {
  const built = buildPaneView({ ...base, rows: 18, selId: 'w15', session: crowded })
  assert.ok(built.agentLines.some(entry => entry.id === 'w15'))
})

// Graph mode: a session with `count` workers, the first finished.
const withWorkers = (count: number) => {
  let state = initialState('abcdef123456', NOW)
  for (let index = 1; index <= count; index++) {
    state = reduce(state, {
      kind: 'agent.start', id: 'w' + index, parentId: 'main', type: 'worker', description: 'task ' + index, at: NOW,
    })
  }
  return state
}
const allLines = (built: ReturnType<typeof buildPaneView>): string[] =>
  [...built.head, ...built.agentLines.map(entry => entry.line), ...built.tail]
const graphBase = { ...base, mode: 'graph' as const, rows: 40 }

test('graph mode draws cards, the pane header first and the real controls as the hint', () => {
  const built = buildPaneView({ ...graphBase, columns: 160, session: withWorkers(3) })
  assert.match(stripCodes(built.head[0]), /^agentview · session abcdef12/)
  assert.match(stripCodes(built.head.join('\n')), /╔═ main/)
  assert.equal(built.agentLines.length, 0)
  assert.match(stripCodes(built.tail.join('\n')), /◂ ▸ select\s+⏎ details\s+t\/g view\s+esc close/)
  assert.doesNotMatch(stripCodes(built.head.join('\n')), /tab tree|live/)
})

test('tree mode is unchanged by the mode option', () => {
  const tree = buildPaneView({ ...base, session: withWorkers(2) })
  assert.deepEqual(buildPaneView({ ...base, mode: 'tree', session: withWorkers(2) }), tree)
})

test('no graph line is wider than the body at 110, 120, 160 and 80 columns', () => {
  for (const columns of [110, 120, 160, 80, 50]) {
    for (const ascii of [false, true]) {
      const built = buildPaneView({ ...graphBase, columns, ascii, session: withWorkers(5) })
      allLines(built).forEach(line => assert.ok(visibleLength(line) <= columns, `${columns}: ${stripCodes(line)}`))
      assert.ok(allLines(built).length > 5)
    }
  }
})

test('the graph has no frame corners or border columns', () => {
  const built = buildPaneView({ ...graphBase, columns: 120, session: withWorkers(2) })
  assert.doesNotMatch(stripCodes(built.head.join('\n')), /tree {2} graph/)
  built.head.slice(1).forEach(line => assert.doesNotMatch(stripCodes(line), /^[╭╰│├╮╯┤]|[╭╰│├╮╯┤]$/))
})

test('workers that do not fit hide behind a range and the pan moves the first column', () => {
  const session = withWorkers(5)
  const first = buildPaneView({ ...graphBase, columns: 110, session })
  assert.deepEqual(first.hiddenColumns, { total: 5, visible: 2, first: 0 })
  assert.match(stripCodes(first.tail.join('\n')), /◂ workers 1–2 of 5 ▸/)
  assert.match(stripCodes(first.head.join('\n')), /task 1/)
  assert.doesNotMatch(stripCodes(first.head.join('\n')), /task 3/)
  const panned = buildPaneView({ ...graphBase, columns: 110, graphCol: 2, session })
  assert.match(stripCodes(panned.tail.join('\n')), /workers 3–4 of 5/)
  assert.match(stripCodes(panned.head.join('\n')), /task 3/)
  assert.doesNotMatch(stripCodes(panned.head.join('\n')), /task 1\b/)
  assert.equal(buildPaneView({ ...graphBase, columns: 110, graphCol: 99, session }).hiddenColumns?.first, 3)
})

test('a wide enough graph hides no columns and shows no range', () => {
  const built = buildPaneView({ ...graphBase, columns: 160, session: withWorkers(3) })
  assert.equal(built.hiddenColumns, undefined)
  assert.doesNotMatch(stripCodes(built.tail.join('\n')), /workers/)
})

test('finished subtrees fold into chips when the graph is taller than the viewport', () => {
  let session = withWorkers(2)
  for (const id of ['g1', 'g2', 'g3']) {
    session = reduce(session, { kind: 'agent.start', id, parentId: 'w1', type: 'helper', description: id, at: NOW })
    session = reduce(session, { kind: 'agent.end', id, ok: true, at: NOW })
  }
  session = reduce(session, { kind: 'agent.end', id: 'w1', ok: true, at: NOW })
  const roomy = buildPaneView({ ...graphBase, columns: 160, rows: 60, session })
  const tight = buildPaneView({ ...graphBase, columns: 160, rows: 14, session })
  assert.ok(tight.head.length < roomy.head.length)
  assert.match(stripCodes(tight.head.join('\n')), /task 2/)
  assert.doesNotMatch(stripCodes(tight.head.join('\n')), /╭─ helper/)
  assert.match(stripCodes(roomy.head.join('\n')), /╭─ helper/)
})

test('the selected agent is drawn as the selected card and the waiting text is short', () => {
  let session = withWorkers(1)
  session = reduce(session, { kind: 'waiting', agentId: 'w1', at: NOW })
  const built = buildPaneView({ ...graphBase, columns: 160, selId: 'w1', session })
  const text = stripCodes(built.head.join('\n'))
  assert.match(text, /◔ waiting/)
  assert.doesNotMatch(text, /waiting for permission/)
})

test('ascii graph leaves no character above U+007F', () => {
  for (const columns of [80, 110, 160]) {
    const built = buildPaneView({ ...graphBase, columns, ascii: true, spin: 3, session: withWorkers(5) })
    allLines(built).forEach(line => assert.ok(
      [...stripCodes(line)].every(char => char.codePointAt(0)! <= 0x7f), `${columns}: ${stripCodes(line)}`,
    ))
  }
})

test('detail view wins over graph mode', () => {
  const built = buildPaneView({ ...graphBase, view: 'detail', selId: 'w1', columns: 120, session: withWorkers(1) })
  assert.match(stripCodes(built.head.join('\n')), /TASK/)
})
