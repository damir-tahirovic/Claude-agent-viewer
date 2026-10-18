// Attention-first status line. A port of variant C in the status-line section of
// docs/design/spec-generator.js (`statusLines`), as plain text for `$.ui.status`.
import { costSlot, showsCost } from '../core/billing'
import { fmtCost, fmtK, fmtT } from '../core/format'
import type { Billing } from '../core/model'
import type { Plan } from '../core/progress'
import type { Row } from './rows'

/** Optional reasons shown next to a waiting or failed agent, keyed by agent id. */
export type StatusReasons = {
  readonly waitingWhy?: Readonly<Record<string, string>>
  readonly failedWhy?: Readonly<Record<string, string>>
}

const HINT = '/agentview'

/** The one line that matters now: waiting, then stuck, then failed, then done, else running counts or idle. */
export const statusLine = (
  rows: ReadonlyArray<Row>,
  plan: Plan | null,
  reasons: StatusReasons = {},
  billing?: Billing,
): string => {
  const waiting = rows.find(row => row.st === 'waiting')
  if (waiting) {
    // The engine's `waiting` is not necessarily a permission prompt, so name a reason only when given one.
    const why = reasons.waitingWhy?.[waiting.id]
    return `◔ ${waiting.name} waiting${why ? ` for ${why}` : ''} · ${waiting.act} · ${HINT}`
  }
  const stuck = rows.find(row => row.st === 'running' && row.stuck)
  if (stuck) {
    const seconds = stuck.actionSecs ?? stuck.secs
    return `! ${stuck.task || stuck.name} on "${stuck.act.replace(/^Bash: /, '')}" for ${fmtT(seconds)} · ${HINT}`
  }
  const failed = rows.find(row => row.st === 'failed')
  if (failed) return `✗ ${failed.task} failed · ${reasons.failedWhy?.[failed.id] ?? 'error'} · ${HINT}`

  const tokens = fmtK(rows.reduce((sum, row) => sum + row.i + row.o, 0))
  const helpers = rows.filter(row => row.d > 0)
  const isPlanComplete = plan !== null && plan.total > 0 && plan.done === plan.total
  if (isPlanComplete && helpers.length > 0 && helpers.every(row => row.st === 'done')) {
    // Off API billing the estimate is not what is being paid, so the line leaves the cost out.
    const cost = showsCost(billing) ? ` · ${fmtCost(rows.reduce((sum, row) => sum + row.cost, 0))}` : ''
    return `✓ all ${rows.length} agents done · ${tokens} tok${cost} · 100%`
  }
  const running = rows.filter(row => row.st === 'running').length
  const progress = plan ? Math.round(plan.done / plan.total * 100) + '%' : '—'
  const unknown = rows.filter(row => row.st === 'unknown').length
  if (running > 0) return `⠋ ${running} running · ${tokens} tok · ${progress}   ${HINT}`
  // Unknown agents may still be working, so idle would hide them.
  if (unknown > 0) return `? ${unknown} unknown · ${tokens} tok · ${progress}   ${HINT}`
  // Nothing running: a spinner would mislead, so say idle and show what the header's cost slot shows.
  const slot = costSlot(billing, rows.reduce((sum, row) => sum + row.cost, 0))
  return `idle · ${tokens} tok · ${progress}${slot === '—' ? '' : ` · ${slot}`}   ${HINT}`
}
