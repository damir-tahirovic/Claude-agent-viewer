import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, reduce } from '../../src/core/reducer'
import type { AgentEvent } from '../../src/core/model'
import { buildRows } from '../../src/view/rows'

const events: AgentEvent[] = [
  {
    kind: 'usage',
    at: 0,
    agentId: 'main',
    model: 'claude-opus-5-5',
    tokens: { input: 100, output: 20, cacheRead: 7, cacheWrite: 3 },
  },
  {
    kind: 'agent.start',
    at: 1000,
    id: 'w',
    type: 'worker',
    description: 'fix login bug',
    model: 'claude-sonnet-5-5',
  },
  {
    kind: 'tool.start',
    at: 2000,
    agentId: 'w',
    toolUseId: 't',
    tool: 'Edit',
    input: { file_path: '/p/src/login.ts' },
  },
]
const state = events.reduce(reduce, initialState('s', 0))

test('maps agents to rows in tree order with depth', () => {
  const rows = buildRows(state, 5000)
  assert.deepEqual(rows.map(row => [row.name, row.d]), [['main', 0], ['worker', 1]])
  const worker = rows[1]
  assert.equal(worker.task, 'fix login bug')
  assert.equal(worker.model, 'sonnet-5-5')
  assert.equal(worker.act, 'Edit src/login.ts')
  assert.equal(worker.secs, 4)
  assert.equal(worker.calls, 1)
})

test('main row carries its token counts', () => {
  const main = buildRows(state, 5000)[0]
  assert.equal(main.i, 100)
  assert.equal(main.o, 20)
  assert.equal(main.cr, 7)
  assert.equal(main.cw, 3)
})

test('main task is empty because main has no start description', () => {
  assert.equal(buildRows(state, 5000)[0].task, '')
})

test('stuck when the same action runs for more than 3 minutes', () => {
  assert.equal(buildRows(state, 2000 + 180_001)[1].stuck, 1)
  assert.equal(buildRows(state, 2000 + 179_000)[1].stuck, undefined)
})

test('finished agent shows its last action and frozen time', () => {
  const ending: AgentEvent[] = [
    { kind: 'tool.end', at: 3000, agentId: 'w', toolUseId: 't', ok: true },
    { kind: 'agent.end', at: 4000, id: 'w', ok: true },
  ]
  const finished = ending.reduce(reduce, state)
  const worker = buildRows(finished, 99_000)[1]
  assert.equal(worker.st, 'done')
  assert.equal(worker.act, 'Edit src/login.ts')
  assert.equal(worker.secs, 3)
})

test('actionSecs counts seconds on the current action', () => {
  assert.equal(buildRows(state, 2000 + 200_000)[1].actionSecs, 200)
  assert.equal(buildRows(state, 5000)[0].actionSecs, undefined)
})
