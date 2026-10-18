import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costSlot, isSameBilling, limitsText, showsCost } from '../../src/core/billing'
import type { Billing } from '../../src/core/model'

const plan: Billing = {
  kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 71 }, { kind: 'seven_day', percentUsed: 21.5 }],
}

test('cost is shown for API billing and when billing is absent, not otherwise', () => {
  assert.equal(showsCost(undefined), true)
  assert.equal(showsCost({ kind: 'api' }), true)
  assert.equal(showsCost(plan), false)
  assert.equal(showsCost({ kind: 'unknown' }), false)
})

test('the cost slot is ~$ for API, the limits for a plan and a dash while unknown', () => {
  assert.equal(costSlot(undefined, 0.61), '~$0.61')
  assert.equal(costSlot(plan, 0.61), '5h 71% · 7d 21.5%')
  assert.equal(costSlot({ kind: 'unknown' }, 0.61), '—')
})

test('limits keep the engine values as given and name unknown windows by their kind', () => {
  assert.equal(limitsText({ kind: 'subscription', limits: [{ kind: 'weird', percentUsed: 7 }] }), 'weird 7%')
})

test('billing values are the same only with the same kind and the same limits', () => {
  assert.equal(isSameBilling(plan, { ...plan, limits: [...plan.kind === 'subscription' ? plan.limits : []] }), true)
  assert.equal(isSameBilling(plan, { kind: 'subscription', limits: [{ kind: 'five_hour', percentUsed: 72 }] }), false)
  assert.equal(isSameBilling({ kind: 'api' }, { kind: 'unknown' }), false)
  assert.equal(isSameBilling({ kind: 'api' }, { kind: 'api' }), true)
})
