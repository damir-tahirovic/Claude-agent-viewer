import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDetail } from '../../src/view/detail'
import { stripCodes } from '../../src/view/lines'
import type { Action, AgentNode, Todo } from '../../src/core/model'
import { frameOf } from './frame'

const START = Date.UTC(2026, 9, 18, 9, 0, 0)
const CLOCK_START_SECS = 14 * 3600 + 2 * 60 + 11
const CURRENT_OFFSET = 199
const NOW = START + 201_000

// [offset secs, tool, summary, duration ms, ok] for the generator's `acts`, minus the live action.
const ACTS: [number, string, string, number, boolean][] = [
  [3, 'Read', 'src/auth.ts', 100, true], [5, 'Read', 'src/session/store.ts', 100, true],
  [9, 'Grep', '"refreshToken"', 300, true], [14, 'Glob', 'src/**/*.test.ts', 100, true],
  [22, 'Read', 'src/login.ts', 100, true], [31, 'Edit', 'src/auth.ts', 200, true],
  [44, 'Edit', 'src/auth.ts', 200, true], [58, 'Bash', 'npx tsc --noEmit', 6100, false],
  [66, 'Read', 'src/types/token.d.ts', 100, true], [74, 'Edit', 'src/types/token.d.ts', 200, true],
  [81, 'Bash', 'npx tsc --noEmit', 5800, true], [93, 'Edit', 'src/auth.ts', 200, true],
  [105, 'Grep', '"rotateRefreshToken"', 200, true], [118, 'Read', 'src/api/routes.ts', 100, true],
  [131, 'Edit', 'src/api/routes.ts', 300, true], [146, 'Bash', 'npm run lint -- src/auth.ts', 4400, true],
  [160, 'Edit', 'src/auth.ts', 200, true], [172, 'Read', 'src/auth.test.ts', 100, true],
  [186, 'Write', 'src/auth.refresh.test.ts', 400, true],
]
const recent: Action[] = ACTS.map(([off, tool, summary, ms, ok]) => ({
  tool, summary, at: START + off * 1000, ok, ms,
}))
// The generator shows the live action at +199s but "12s on this action" with 201s elapsed; the
// two cannot both come from one timestamp, so the clock maps the live action's `since` to +199s.
const SINCE = NOW - 12_000
const clock = (ms: number): string => {
  const total = CLOCK_START_SECS + (ms === SINCE ? CURRENT_OFFSET : (ms - START) / 1000)
  return [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60]
    .map(n => String(n).padStart(2, '0')).join(':')
}
const agent: AgentNode = {
  id: 'r3',
  parentId: 'main',
  type: 'worker',
  description: 'Add refresh-token rotation to src/auth.ts: issue a new refresh token on every use, ' +
    'invalidate the previous one,\n' +
    'and wire the flow into the login handler. ' +
    'Keep the existing session cookie format untouched.',
  model: 'claude-sonnet-5-5',
  status: 'running',
  startedAt: START,
  lastSignal: NOW,
  current: { toolUseId: 't', tool: 'Edit', summary: 'src/auth.ts', since: SINCE },
  recent,
  toolCount: 24,
  tokens: { input: 7400, output: 1900, cacheRead: 31200, cacheWrite: 4100 },
}
const todos: Todo[] = [
  { content: 'Read auth.ts and session store', status: 'completed' },
  { content: 'Add rotateRefreshToken()', status: 'completed' },
  { content: 'Wire rotation into login handler', status: 'in_progress' },
  { content: 'Add tests for rotation', status: 'pending' },
]
const opts = {
  W: 120, agent, parentName: 'main', todos, now: NOW, clock,
  title: 'add token refresh', cost: 0.12, sessionCost: 1.1,
}

test('detail matches golden 2', () => {
  assert.deepEqual(renderDetail(opts), frameOf('2'))
})

test('spin replaces the spinner frame', () => {
  const text = renderDetail({ ...opts, spin: '⠙' }).map(stripCodes).join('\n')
  assert.match(text, /⠙ running/)
  assert.match(text, /14:05:30 ⠙ Edit/)
})

test('ascii output has no box-drawing characters', () => {
  assert.doesNotMatch(renderDetail({ ...opts, ascii: true }).map(stripCodes).join('\n'), /[╭─│╰]/)
})

test('frame false drops borders and keeps every line W minus 2 wide', () => {
  const lines = renderDetail({ ...opts, frame: false }).map(stripCodes)
  assert.equal(lines.length, frameOf('2').length - 2)
  lines.forEach(line => assert.equal([...line].length, 118))
})
