import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentEvent, SessionState } from '../../src/core/model'
import { reduce, initialState } from '../../src/core/reducer'
import { buildPaneView } from '../../src/mod/pane-view'
import { stripCodes, visibleLength } from '../../src/view/lines'

const NOW = 1_700_000_000_000
const base = {
  view: 'tree' as const, selId: 'main', spin: 0, now: NOW, columns: 100, rows: 30, ascii: false,
}
/** A fresh session starts with unknown billing, which hides cost; these tests are about layout with cost shown. */
const apiState = (id: string): SessionState => ({ ...initialState(id, NOW), billing: { kind: 'api' } })
const twoAgents = reduce(apiState('abcdef123456'), {
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
  let state = apiState('abcdef123456')
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
  assert.match(stripCodes(built.tail.join('\n')), /p\/n select {3}d details {3}t\/g view {3}esc close/)
  assert.doesNotMatch(stripCodes(built.head.join('\n')), /tab tree|live/)
})

test('tree mode is unchanged by the mode option', () => {
  const tree = buildPaneView({ ...base, session: withWorkers(2) })
  assert.deepEqual(buildPaneView({ ...base, mode: 'tree', session: withWorkers(2) }), tree)
})

const oversized = (workerCount: number, grandchildren = 0) => {
  let session = withWorkers(workerCount)
  for (let index = 1; index <= grandchildren; index++) {
    session = reduce(session, {
      kind: 'agent.start', id: 'gc' + index, parentId: 'w1', type: 'helper', description: 'gc' + index, at: NOW,
    })
  }
  return session
}

test('a graph taller than the pane is cut to the pane with a dimmed more-lines marker', () => {
  for (const [columns, session] of [[100, oversized(30)], [160, oversized(3, 16)]] as const) {
    const built = buildPaneView({ ...graphBase, columns, rows: 24, session })
    const total = built.head.length + built.tail.length + 1 + (built.isToggleBeside ? 0 : 1)
    assert.ok(total <= 24, `${columns}: ${total} > 24`)
    assert.match(stripCodes(built.head[built.head.length - 1]), /^ {2}↓ \d+ more lines\s*$/)
    assert.ok(built.head[built.head.length - 1].includes('{d|'))
    allLines(built).forEach(line => assert.ok(visibleLength(line) <= columns))
  }
})

test('a graph that fits the pane has no more-lines marker', () => {
  const built = buildPaneView({ ...graphBase, columns: 160, rows: 60, session: withWorkers(2) })
  assert.doesNotMatch(stripCodes(built.head.join('\n')), /more lines/)
})

test('a worker with 16 grandchildren is drawn whole, down to its bottom border', () => {
  const built = buildPaneView({ ...graphBase, columns: 160, rows: 500, session: oversized(1, 16) })
  const lines = built.head.map(stripCodes)
  const last = lines.findIndex(line => line.includes('gc16'))
  assert.ok(last > 0)
  assert.ok(lines.slice(last).some(line => line.includes('╰')), 'bottom border missing')
  assert.doesNotMatch(lines.join('\n'), /more lines/)
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
  const tight = buildPaneView({ ...graphBase, columns: 160, rows: 18, session })
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

test('ascii graph with a waiting grandchild leaves no character above U+007F', () => {
  let session = withWorkers(2)
  session = reduce(session, { kind: 'agent.start', id: 'gw', parentId: 'w1', type: 'helper', description: 'gw', at: NOW })
  session = reduce(session, { kind: 'waiting', agentId: 'gw', at: NOW })
  for (const columns of [80, 110, 160]) {
    const built = buildPaneView({ ...graphBase, columns, ascii: true, session })
    allLines(built).forEach(line => assert.ok(
      [...stripCodes(line)].every(char => char.codePointAt(0)! <= 0x7f), `${columns}: ${stripCodes(line)}`,
    ))
  }
})

test('ascii graph leaves no character above U+007F', () => {
  for (const columns of [80, 110, 160]) {
    const built = buildPaneView({ ...graphBase, columns, ascii: true, spin: 3, session: withWorkers(5) })
    allLines(built).forEach(line => assert.ok(
      [...stripCodes(line)].every(char => char.codePointAt(0)! <= 0x7f), `${columns}: ${stripCodes(line)}`,
    ))
  }
})

test('the tree hint names the t/g view toggle', () => {
  const built = buildPaneView({ ...base, session: twoAgents })
  assert.match(stripCodes(built.tail.join('\n')), /↑↓ select {3}⏎ details {3}t\/g view {3}esc close/)
})

test('detail view wins over graph mode', () => {
  const built = buildPaneView({ ...graphBase, view: 'detail', selId: 'w1', columns: 120, session: withWorkers(1) })
  assert.match(stripCodes(built.head.join('\n')), /TASK/)
})

test('the graph hint adds h/l columns only when columns are hidden', () => {
  const hidden = buildPaneView({ ...graphBase, columns: 110, session: withWorkers(5) })
  assert.match(stripCodes(hidden.tail.join('\n')), /esc close {3}h\/l columns/)
  const shown = buildPaneView({ ...graphBase, columns: 160, session: withWorkers(3) })
  assert.doesNotMatch(stripCodes(shown.tail.join('\n')), /h\/l/)
})

test('tree content plus chrome fits the viewport rows, with the toggle beside the header or below it', () => {
  for (const columns of [60, 80, 160]) {
    const rows = 20
    const built = buildPaneView({ ...base, columns, rows, session: withWorkers(12) })
    const total = built.head.length + built.agentLines.length + built.tail.length + (built.isToggleBeside ? 0 : 1)
    assert.ok(total <= rows, `${columns}: ${total} > ${rows}`)
  }
})

test('graph folding counts the footer Buttons row and a separate toggle row as chrome', () => {
  let session = withWorkers(2)
  for (const id of ['g1', 'g2', 'g3']) {
    session = reduce(session, { kind: 'agent.start', id, parentId: 'w1', type: 'helper', description: id, at: NOW })
    session = reduce(session, { kind: 'agent.end', id, ok: true, at: NOW })
  }
  session = reduce(session, { kind: 'agent.end', id: 'w1', ok: true, at: NOW })
  for (const columns of [120, 160]) {
    const open = buildPaneView({ ...graphBase, columns, rows: 200, session })
    const chrome = 1 + open.tail.length + 1 + (open.isToggleBeside ? 0 : 1)
    const unfolded = open.head.length - 1 + chrome
    const tight = buildPaneView({ ...graphBase, columns, rows: unfolded - 1, session })
    const total = tight.head.length + tight.tail.length + 1 + (tight.isToggleBeside ? 0 : 1)
    assert.ok(total <= unfolded - 1, `${columns}: ${total} > ${unfolded - 1}`)
    assert.doesNotMatch(stripCodes(tight.head.join('\n')), /╭─ helper/)
  }
})

test('the toggle takes its own row when the header is too long to share one at 80 columns', () => {
  let session = withWorkers(1)
  session = reduce(session, {
    kind: 'usage', at: NOW, agentId: 'main', model: 'claude-opus-4-1',
    tokens: { input: 9_000_000_000_000, output: 9_000_000_000_000, cacheRead: 0, cacheWrite: 0 },
  })
  const long = buildPaneView({ ...base, columns: 80, session })
  assert.ok(visibleLength(long.head[0]) + 2 + 14 > 80, stripCodes(long.head[0]))
  assert.equal(long.isToggleBeside, false)
  assert.equal(buildPaneView({ ...base, columns: 80, session: withWorkers(1) }).isToggleBeside, true)
})

test('a failed worker card reads failed with the generic error, not an invented exit code', () => {
  const session = reduce(withWorkers(1), { kind: 'agent.end', id: 'w1', ok: false, at: NOW })
  const text = stripCodes(buildPaneView({ ...graphBase, columns: 160, session }).head.join('\n'))
  assert.match(text, /✗ failed · error/)
  assert.doesNotMatch(text, /exit 1/)
})

const subscription: SessionState = {
  ...twoAgents,
  billing: { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 71 }, { kind: 'seven_day', percentUsed: 21 }] },
}
const unknown: SessionState = { ...twoAgents, billing: { kind: 'unknown' } }
const withTokens = (session: SessionState) => reduce(session, {
  kind: 'usage', at: NOW, agentId: 'main', model: 'claude-opus-5-5',
  tokens: { input: 9000, output: 4000, cacheRead: 0, cacheWrite: 0 },
})
const screen = (opts: Parameters<typeof buildPaneView>[0]): string => {
  const built = buildPaneView(opts)
  return stripCodes([...built.head, ...built.agentLines.map(entry => entry.line), ...built.tail].join('\n'))
}

for (const mode of ['tree', 'graph'] as const) {
  for (const columns of [100, 160]) {
    test(`${mode} at ${columns} columns: API billing shows ~$ cost`, () => {
      assert.match(screen({ ...base, columns, mode, session: withTokens(twoAgents) }), /~\$/)
    })
    test(`${mode} at ${columns} columns: a subscription shows plan limits and no ~$ or mark`, () => {
      const text = screen({ ...base, columns, mode, session: withTokens(subscription) })
      assert.doesNotMatch(text, /~\$|▲/)
      assert.match(text.split('\n')[0], /5h 71% · 7d 21%/)
    })
    test(`${mode} at ${columns} columns: unknown billing hides cost and shows a dash in the header`, () => {
      const text = screen({ ...base, columns, mode, session: withTokens(unknown) })
      assert.doesNotMatch(text, /~\$|▲/)
      assert.match(text.split('\n')[0], /tok · — · plan/)
    })
  }
}

test('detail view hides the cost line and the header cost on a subscription, and shows them on API billing', () => {
  const detail = { ...base, view: 'detail' as const, selId: 'main', columns: 120 }
  assert.doesNotMatch(screen({ ...detail, session: withTokens(subscription) }), /~\$|cost/)
  assert.match(screen({ ...detail, session: withTokens(twoAgents) }), /~\$.*\n[\s\S]*cost +~\$/)
})

/** Lines the Pane draws for a view: its own lines plus the toggle row (when not beside the header) and the Button row. */
const drawnLines = (view: ReturnType<typeof buildPaneView>, kind: 'tree' | 'graph' | 'detail'): number => {
  const own = view.head.length + view.agentLines.length + view.tail.length
  if (kind === 'detail') return own + 1
  return own + (view.isToggleBeside ? 0 : 1) + (kind === 'graph' ? 1 : 0)
}

const manyAgents = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'].reduce(
  (session, id) => reduce(session, { kind: 'agent.start', id, parentId: 'main', type: 'worker', description: id, at: NOW }),
  withTodos,
)

test('the pane fits a small body in tree, graph and detail modes', () => {
  const SMALL_ROWS = 14
  for (const columns of [60, 100, 140]) {
    for (const session of [twoAgents, withTodos, manyAgents]) {
      for (const [kind, mode, view, selId] of [
        ['tree', 'tree', 'tree', 'main'], ['graph', 'graph', 'tree', 'main'], ['graph', 'graph', 'tree', 'a2'],
        ['detail', 'tree', 'detail', 'a1'],
      ] as const) {
        const built = buildPaneView({ ...base, columns, rows: SMALL_ROWS, session, mode, view, selId })
        const total = drawnLines(built, kind)
        assert.ok(total <= SMALL_ROWS, `${kind} ${columns} cols ${Object.keys(session.agents).length} agents: ${total} lines`)
      }
    }
  }
})

const withList = (events: AgentEvent[]): SessionState => events.reduce(reduce, twoAgents)
const listed = withList([
  { kind: 'todos', at: NOW, agentId: 'a1', todos: [
    { content: 'a', status: 'completed' }, { content: 'b', status: 'completed' }, { content: 'c', status: 'completed' },
    { content: 'd', status: 'pending' }, { content: 'e', status: 'pending' },
  ] },
])

test('the detail header shows progress 3/5 (60%) when the agent has a list, and nothing otherwise', () => {
  const withProgress = buildPaneView({ ...base, view: 'detail', selId: 'a1', session: listed })
  assert.match(stripCodes(withProgress.head[0]), /progress 3\/5 \(60%\)/)
  const without = buildPaneView({ ...base, view: 'detail', selId: 'a1', session: twoAgents })
  assert.ok(!stripCodes(without.head[0]).includes('progress'))
})

test('the tree shows the PLAN column only when a subagent has a list', () => {
  const tree = (session: SessionState): string => stripCodes(buildPaneView({ ...base, columns: 120, session }).head.join('\n'))
  assert.match(tree(listed), /PLAN/)
  assert.ok(!tree(twoAgents).includes('PLAN'))
})
