import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDialog, windowFor } from '../../src/view/dialog'
import { colorize, dim, stripCodes, visibleLength } from '../../src/view/lines'
import type { Row } from '../../src/view/rows'
import { specRows } from '../fixtures/spec-rows'
import { frameOf } from './frame'

const plan = { done: 6, total: 10, cur: 'Add token refresh to auth.ts' }

const manyAgents: Row[] = [
  { id: 'm0', d: 0, name: 'main', task: 'migrate webshop to vitest + new API', model: 'opus-5-5', st: 'running', act: 'Task: update API routes', i: 41200, o: 8300, cr: 160000, cw: 22000, calls: 38, secs: 905, cost: 0.94 },
  { id: 'm1', d: 1, name: 'worker', task: 'migrate db schema', model: 'sonnet-5-5', st: 'done', act: 'Read src/routes/users.ts', i: 4300, o: 670, cr: 12900, cw: 2150, calls: 7, secs: 53, cost: 0.02 },
  { id: 'm2', d: 2, name: 'scout', task: 'list table usages', model: 'haiku-5-5', st: 'done', act: 'Grep "SELECT"', i: 5600, o: 840, cr: 16800, cw: 2800, calls: 9, secs: 76, cost: 0.03 },
  { id: 'm3', d: 2, name: 'Explore', task: 'find raw SQL', model: 'haiku-5-5', st: 'done', act: 'Bash: npm run build', i: 6900, o: 1010, cr: 20700, cw: 3450, calls: 11, secs: 99, cost: 0.04 },
  { id: 'm4', d: 1, name: 'worker', task: 'update API routes', model: 'sonnet-5-5', st: 'running', act: 'Edit tests/cart.test.ts', i: 8200, o: 1180, cr: 24600, cw: 4100, calls: 13, secs: 122, cost: 0.04 },
  { id: 'm5', d: 2, name: 'worker', task: 'rewrite /users', model: 'sonnet-5-5', st: 'running', act: 'Glob **/*.yml', i: 9500, o: 1350, cr: 28500, cw: 4750, calls: 15, secs: 145, cost: 0.05 },
  { id: 'm6', d: 2, name: 'worker', task: 'rewrite /orders', model: 'sonnet-5-5', st: 'running', act: 'Read docs/api.md', i: 10800, o: 1520, cr: 32400, cw: 5400, calls: 17, secs: 168, cost: 0.06 },
  { id: 'm7', d: 2, name: 'reviewer', task: 'check route types', model: 'sonnet-5-5', st: 'running', act: 'Edit .github/ci.yml', i: 12100, o: 1690, cr: 36300, cw: 6050, calls: 19, secs: 191, cost: 0.06 },
  { id: 'm8', d: 1, name: 'worker', task: 'port tests to vitest', model: 'sonnet-5-5', st: 'running', act: 'Edit src/db/schema.ts', i: 13400, o: 1860, cr: 40200, cw: 6700, calls: 21, secs: 214, cost: 0.07 },
  { id: 'm9', d: 2, name: 'worker', task: 'port auth tests', model: 'sonnet-5-5', st: 'waiting', act: 'Read src/routes/users.ts', i: 14700, o: 2030, cr: 44100, cw: 7350, calls: 23, secs: 237, cost: 0.07 },
  { id: 'm10', d: 2, name: 'worker', task: 'port cart tests', model: 'sonnet-5-5', st: 'running', act: 'Grep "SELECT"', i: 16000, o: 2200, cr: 48000, cw: 8000, calls: 25, secs: 260, cost: 0.08 },
  { id: 'm11', d: 1, name: 'worker', task: 'update docs', model: 'haiku-5-5', st: 'running', act: 'Bash: npm run build', i: 17300, o: 2370, cr: 51900, cw: 8650, calls: 27, secs: 283, cost: 0.09 },
  { id: 'm12', d: 2, name: 'scout', task: 'collect changed APIs', model: 'haiku-5-5', st: 'failed', act: 'Edit tests/cart.test.ts', i: 18600, o: 2540, cr: 55800, cw: 9300, calls: 29, secs: 306, cost: 0.09 },
  { id: 'm13', d: 1, name: 'worker', task: 'CI pipeline', model: 'sonnet-5-5', st: 'running', act: 'Glob **/*.yml', i: 19900, o: 2710, cr: 59700, cw: 9950, calls: 31, secs: 329, cost: 0.1 },
  { id: 'm14', d: 2, name: 'Explore', task: 'inspect workflows', model: 'haiku-5-5', st: 'running', act: 'Read docs/api.md', i: 21200, o: 2880, cr: 63600, cw: 10600, calls: 33, secs: 352, cost: 0.11 },
  { id: 'm15', d: 2, name: 'worker', task: 'edit ci.yml', model: 'sonnet-5-5', st: 'done', act: 'Edit .github/ci.yml', i: 22500, o: 3050, cr: 67500, cw: 11250, calls: 35, secs: 375, cost: 0.11 },
]

const failedAgents: Row[] = specRows().map(r =>
  r.id === 'r6' ? { id: r.id, d: r.d, name: r.name, task: r.task, model: r.model, st: 'failed', act: 'Bash: npm test · exit 1',
    i: r.i, o: r.o, cr: r.cr, cw: r.cw, calls: r.calls, secs: r.secs, cost: r.cost } : r)
const endedAgents: Row[] = specRows().map(r => ({
  id: r.id, d: r.d, name: r.name, task: r.task, model: r.model, st: 'done' as const,
  act: r.d ? r.act : 'Task: final summary', i: r.i, o: r.o, cr: r.cr, cw: r.cw, calls: r.calls,
  secs: r.id === 'r0' ? 862 : r.secs, cost: r.cost,
}))
const mainOnly: Row[] = [{
  id: 'e0', d: 0, name: 'main', task: 'refactor auth flow', model: 'opus-5-5', st: 'running', act: 'Read docs/auth.md',
  i: 2100, o: 380, cr: 4000, cw: 1700, calls: 3, secs: 41, cost: 0.04,
}]

test('1a · 120 cols', () => {
  assert.deepEqual(renderDialog({ W: 120, agents: specRows(), sel: 3, plan }), frameOf('1a'))
})
test('1b · 160 cols', () => {
  assert.deepEqual(renderDialog({ W: 160, agents: specRows(), sel: 3, plan }), frameOf('1b'))
})
test('3a · 80 cols', () => {
  assert.deepEqual(renderDialog({ W: 80, agents: specRows(), sel: 3, plan }), frameOf('3a'))
})
test('3b · ascii', () => {
  assert.deepEqual(renderDialog({ W: 80, agents: specRows(), sel: 3, plan, ascii: true }), frameOf('3b'))
})
test('6 · standalone single session with path, hints and padding', () => {
  const hints: [string, string][] = [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'sessions'], ['q', 'quit']]
  assert.deepEqual(
    renderDialog({ W: 120, agents: specRows(), sel: 0, plan, path: '~/code/webshop', hints, minRows: 14 }),
    frameOf('6'))
})
test('7a · empty session lists main alone', () => {
  assert.deepEqual(renderDialog({
    W: 80, agents: mainOnly, sel: 0, plan: null,
    after: [dim('  ◌ no subagents yet — they appear here as soon as main delegates')],
  }), frameOf('7a'))
})
test('7b · many agents scroll in a window', () => {
  assert.deepEqual(renderDialog({
    W: 120, agents: manyAgents, sel: 9, plan: { done: 4, total: 12, cur: 'Update API routes' }, win: [3, 13],
  }), frameOf('7b'))
})
test('7c · failed subagent', () => {
  assert.deepEqual(renderDialog({
    W: 120, agents: failedAgents, sel: 6, plan,
    after: [colorize('rB', '✗ ') + colorize('r', 'write auth tests') +
      ' failed — Bash: npm test exited 1 after 4m10s ' + dim('· ⏎ for output')],
  }), frameOf('7c'))
})
test('7d · waiting for permission', () => {
  assert.deepEqual(renderDialog({
    W: 120, agents: specRows(), sel: 5, plan,
    after: [colorize('y', '◔ ') + colorize('yB', 'reviewer') + ' is waiting for permission: ' +
      colorize('y', 'Bash: rm -rf dist') + dim(' · answer in the Claude Code prompt · 1m35s')],
  }), frameOf('7d'))
})
test('7e · finished session', () => {
  assert.deepEqual(renderDialog({
    W: 120, agents: endedAgents, sel: 0, plan: { done: 10, total: 10, cur: 'all todos complete' },
    ended: '14m22s', after: [colorize('g', '✓ ') + 'Finished in 14m22s — nothing is running'],
  }), frameOf('7e'))
})

test('spin replaces the spinner frame for running agents', () => {
  const lines = renderDialog({ W: 120, agents: specRows(), sel: 3, plan, spin: '⠙' }).map(stripCodes)
  assert.ok(lines.some(l => l.includes('⠙ running')))
  assert.ok(!lines.some(l => l.includes('⠋')))
})
test('frame false drops borders and keeps every line W minus 2 wide', () => {
  const lines = renderDialog({ W: 122, agents: specRows(), sel: 3, plan, frame: false }).map(stripCodes)
  assert.equal(lines.length, frameOf('1a').length - 2)
  assert.ok(lines.every(l => [...l].length === 120))
  assert.ok(!lines.some(l => /^[│╭╰├]|[│┃╮╯┤]$/.test(l)))
})

test('windowFor shows everything when the rows fit', () => {
  assert.deepEqual(windowFor(5, 2, 10), [0, 5])
})
test('windowFor keeps the previous window while the selection is inside it', () => {
  assert.deepEqual(windowFor(17, 9, 10, [3, 13]), [3, 13])
})
test('windowFor scrolls one row down when the selection passes the bottom edge', () => {
  assert.deepEqual(windowFor(17, 13, 10, [3, 13]), [4, 14])
})
test('windowFor scrolls one row up when the selection passes the top edge', () => {
  assert.deepEqual(windowFor(17, 2, 10, [3, 13]), [2, 12])
})
test('windowFor starts at the top without a previous window', () => {
  assert.deepEqual(windowFor(17, 0, 10), [0, 10])
})

test('below 60 columns every line is exactly W wide, with and without the frame', () => {
  for (const [label, sample, sampleAgents] of [['plan', plan, manyAgents], ['no plan', null, specRows()]] as const) {
    for (const [W, frame] of [[50, true], [50, false], [59, true], [59, false]] as const) {
      const lines = renderDialog({ W, agents: [...sampleAgents], sel: 1, plan: sample, frame })
      lines.forEach(rendered => assert.equal(visibleLength(rendered), frame ? W : W - 2, `${label} W=${W} frame=${frame}: ${stripCodes(rendered)}`))
    }
  }
})

test('narrow mode shows only name, a status glyph and time', () => {
  const text = renderDialog({ W: 50, agents: [...specRows()], plan }).map(stripCodes).join('\n')
  assert.match(text, /AGENT/)
  assert.match(text, /TIME/)
  assert.doesNotMatch(text, /MODEL|TASK|NOW|COST|running/)
})

const costRow = (id: string, d: number, cost: number): Row => ({ ...mainOnly[0], id, d, cost, st: 'done' })
const dialogText = (agents: Row[]): string => renderDialog({ W: 120, agents, sel: 0, plan: null }).map(stripCodes).join('\n')

test('a single agent costing $0.00 shows no expensive mark', () => {
  assert.ok(!dialogText([costRow('a', 0, 0)]).includes('▲'))
})

test('the first of two agents at $0.06 and $0.02 shows the expensive mark', () => {
  const lines = renderDialog({ W: 120, agents: [costRow('a', 0, 0.06), costRow('b', 1, 0.02)], sel: 0, plan: null })
    .map(stripCodes)
  assert.equal(lines.filter(line => line.includes('▲')).length, 1)
  assert.ok(lines.find(line => line.includes('▲'))?.includes('~$0.06▲'))
})
