import { fmtCost } from './format'
import type { Billing } from './model'

/** Whether two billing values are the same, limit by limit. */
export const isSameBilling = (left: Billing, right: Billing): boolean => {
  if (left.kind !== right.kind) return false
  if (left.kind !== 'subscription' || right.kind !== 'subscription') return true
  return left.limits.length === right.limits.length &&
    left.limits.every((limit, index) =>
      limit.kind === right.limits[index].kind && limit.percentUsed === right.limits[index].percentUsed)
}

/** Whether per-token cost is shown: only with API billing; a missing value counts as API. */
export const showsCost = (billing?: Billing): boolean => billing === undefined || billing.kind === 'api'

const LIMIT_LABELS: Readonly<Record<string, string>> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

/** Plan usage as the engine reports it, e.g. `5h 71% · 7d 21%`; the percentages are not rounded again. */
export const limitsText = (billing: Billing): string =>
  billing.kind === 'subscription'
    ? billing.limits.map(limit => `${LIMIT_LABELS[limit.kind] ?? limit.kind} ${limit.percentUsed}%`).join(' · ')
    : ''

/** What the cost total slot of a header shows: `~$x`, the plan limits, or a dash while billing is unknown. */
export const costSlot = (billing: Billing | undefined, cost: number): string => {
  if (billing === undefined || billing.kind === 'api') return fmtCost(cost)
  return billing.kind === 'subscription' && billing.limits.length > 0 ? limitsText(billing) : '—'
}
