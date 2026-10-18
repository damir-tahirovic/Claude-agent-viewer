import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLine } from '../../src/view/status'
import type { Billing } from '../../src/core/model'
import { specRows } from '../fixtures/spec-rows'

const plan = { done: 6, total: 10, cur: 'x' }
test('waiting wins', () => {
  assert.equal(
    statusLine(specRows(), plan),
    '◔ reviewer waiting · Bash: rm -rf dist · /agentview',
  )
})
test('stuck next', () => {
  const r = specRows().map(x => x.st === 'waiting' ? { ...x, st: 'running' as const } : x)
  assert.equal(statusLine(r, plan), '! write auth tests on "npm test" for 4m10s · /agentview')
})
test('failed next', () => {
  const r = specRows().map(x => ({
    ...x, stuck: undefined, st: x.st === 'waiting' ? 'running' as const : x.st,
  }))
  r[6] = { ...r[6], st: 'failed' }
  assert.equal(
    statusLine(r, plan, { failedWhy: { r6: 'exit 1' } }),
    '✗ write auth tests failed · exit 1 · /agentview',
  )
})
test('counts fallback', () => {
  const r = specRows().map(x => ({ ...x, stuck: undefined, st: x.st === 'waiting' ? 'done' as const : x.st }))
  assert.equal(statusLine(r, plan), '⠋ 4 running · 67.5k tok · 60%   /agentview')
})
test('no plan shows —', () => {
  assert.match(statusLine([{ ...specRows()[0] }], null), /· —   \/agentview$/)
})
test('waiting reason comes from waitingWhy', () => {
  const line = statusLine(specRows(), plan, { waitingWhy: { r5: 'input' } })
  assert.match(line, /^◔ reviewer waiting for input · /)
})
test('all done with a complete plan', () => {
  const r = specRows().map(x => ({ ...x, stuck: undefined, st: x.d ? 'done' as const : x.st }))
  const done = { done: 10, total: 10, cur: 'x' }
  assert.match(statusLine(r, done), /^✓ all 7 agents done · 67\.5k tok · ~\$1\.10 · 100%$/)
})
test('children done but plan incomplete falls back to counts', () => {
  const r = specRows().map(x => ({ ...x, stuck: undefined, st: x.d ? 'done' as const : x.st }))
  assert.match(statusLine(r, plan), /^⠋ 1 running · /)
})

test('main stuck names main and the time on the action, not the agent age', () => {
  const main = { ...specRows()[0], st: 'running' as const, task: '', act: 'Bash: npm test', secs: 900, actionSecs: 200, stuck: 1 as const }
  assert.equal(statusLine([main], null), '! main on "npm test" for 3m20s · /agentview')
})

const idleRows = () => [{ ...specRows()[0], st: 'done' as const, stuck: undefined }]
const sub: Billing = { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 84 }, { kind: 'seven_day', percentUsed: 23 }] }

test('idle with zero running shows no spinner and no running count', () => {
  const line = statusLine(idleRows(), plan, {}, { kind: 'unknown' })
  assert.match(line, /^idle · \S+ tok · 60%   \/agentview$/)
  assert.doesNotMatch(line, /running|⠋/)
})
test('idle on a subscription appends the plan limits as the dialog header shows them', () => {
  assert.match(statusLine(idleRows(), plan, {}, sub), / · 60% · 5h 84% · 7d 23%   \/agentview$/)
})
test('idle on api billing appends the total cost', () => {
  const rows = [{ ...idleRows()[0], cost: 1.1 }]
  assert.match(statusLine(rows, plan, {}, { kind: 'api' }), /^idle · \S+ tok · 60% · ~\$1\.10   \/agentview$/)
})
test('idle with unknown billing appends nothing extra', () => {
  assert.match(statusLine(idleRows(), null, {}, { kind: 'unknown' }), /^idle · \S+ tok · —   \/agentview$/)
})
test('a session with only main never gets the all-done line', () => {
  const done = { done: 10, total: 10, cur: 'x' }
  assert.match(statusLine(idleRows(), done, {}, { kind: 'unknown' }), /^idle · /)
})
test('running agents keep the spinner count even on a subscription', () => {
  const running = [{ ...idleRows()[0], st: 'running' as const }]
  assert.match(statusLine(running, plan, {}, sub), /^⠋ 1 running · \S+ tok · 60%   \/agentview$/)
})

test('unknown agents are shown instead of idle', () => {
  const rows = [{ ...idleRows()[0], st: 'unknown' as const }]
  assert.match(statusLine(rows, plan, {}, { kind: 'unknown' }), /^\? 1 unknown · \S+ tok · 60%   \/agentview$/)
})
