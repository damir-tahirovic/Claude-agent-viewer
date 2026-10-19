import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSessions, type SessionListItem } from '../../src/view/sessions'
import { dim, stripCodes, visibleLength } from '../../src/view/lines'
import { frameOf } from './frame'

const item = (
  status: SessionListItem['status'], project: string, id: string, agents: string, tok: number, cost: number,
  plan: string, act: string, ago: string,
): SessionListItem => ({ status, project, id, agents, tok, cost, plan, act, ago })

const active = [
  item('running', '~/code/webshop', '7f3a9c2e', '7 (4 run)', 52300, 1.10, '60%', 'Edit src/auth.ts', '2s'),
  item('waiting', '~/code/api-gateway', 'c01d44ab', '4 (1 wait)', 28300, 0.52, '30%', 'Bash: rm -rf dist', '1m35s'),
  item('running', '~/code/agentview', '9be2117f', '2 (1 run)', 9100, 0.21, '—', 'Read README.md', '4s'),
]
const recent = [
  item('done', '~/code/webshop', '31d8a0b7', '5', 88400, 2.31, '100%', 'session finished', '38m'),
  item('failed', '~/notes/site', 'e5527c13', '3', 15700, 0.34, '40%', 'Bash: npm run build · exit 1', '2h'),
  item('unknown', '~/code/dotfiles', '0a6bf9d4', '1', 3200, 0.05, '—', 'no heartbeat', '1d'),
]
const base = { active, recent, selId: '7f3a9c2e', totalTok: 118300, totalCost: 4.53, hasCost: true }

test('5 · 120 cols', () => {
  assert.deepEqual(renderSessions({ ...base, W: 120 }), frameOf('5'))
})
test('5b · 80 cols', () => {
  assert.deepEqual(renderSessions({ ...base, W: 80 }), frameOf('5b'))
})
test('without cost: no COST column and a dash in the header', () => {
  const plain = renderSessions({ ...base, W: 120, hasCost: false }).map(stripCodes)
  assert.ok(!plain.some(l => l.includes('COST') || l.includes('~$')))
  assert.ok(plain[0].includes('118.3k tok today · —'))
  assert.ok(plain.every(l => [...l].length === 120))
})
test('empty lists show one dim line', () => {
  const lines = renderSessions({ ...base, active: [], recent: [], selId: undefined, W: 100 })
  const message = dim('no Claude Code sessions found in ~/.claude/projects')
  assert.equal(lines.filter(l => stripCodes(l).includes('no Claude Code sessions')).length, 1)
  assert.ok(lines.some(l => l.includes(message)))
  assert.ok(!lines.some(l => stripCodes(l).includes('ACTIVE') || stripCodes(l).includes('RECENT')))
})
test('more sessions than minRows scroll and keep the selection visible', () => {
  const lines = renderSessions({ ...base, W: 120, selId: '0a6bf9d4', minRows: 12 })
  const plain = lines.map(stripCodes)
  assert.equal(lines.length, 12)
  assert.ok(plain.some(l => l.includes('more above')))
  assert.ok(plain.some(l => l.startsWith('│▸') && l.includes('0a6bf9d4')))
  assert.ok(plain.every(l => visibleLength(l) === 120))
})
test('minRows pads a short list with blank lines', () => {
  const lines = renderSessions({ ...base, W: 80, minRows: 20 })
  assert.equal(lines.length, 20)
})
test('ascii swaps box glyphs', () => {
  const lines = renderSessions({ ...base, W: 80, ascii: true })
  assert.ok(lines.every(l => !/[╭│─▸⠋◔✓✗]/.test(l)))
})

test('a partial session shows a plus after its TOK and the title total', () => {
  const partial = { ...recent[0], tok: 88400, isTokPartial: true as const }
  const lines = renderSessions({ ...base, recent: [partial], W: 120, isTotalPartial: true }).map(stripCodes)
  assert.match(lines[0], /118\.3k\+ tok today/)
  assert.ok(lines.some(line => line.includes('88.4k+')))
  for (const line of renderSessions({ ...base, recent: [partial], W: 80, isTotalPartial: true })) {
    assert.equal(visibleLength(line), 80)
  }
})
