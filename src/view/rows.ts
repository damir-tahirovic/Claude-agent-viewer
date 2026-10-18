import { costOf } from '../core/cost'
import { shortModel } from '../core/format'
import { orderTree } from '../core/reducer'
import type { SessionState } from '../core/model'

/** Lifecycle state shown in the status column. */
export type RowStatus = 'running' | 'waiting' | 'done' | 'failed' | 'unknown'

/**
 * One agent as the spec table shows it. Field names follow the generator's agent record,
 * plus `id`, so the dialog port reads them unchanged.
 */
export type Row = {
  readonly id: string
  readonly d: number
  readonly name: string
  readonly task: string
  readonly model: string
  readonly st: RowStatus
  readonly act: string
  readonly i: number
  readonly o: number
  readonly cr: number
  readonly cw: number
  readonly calls: number
  readonly secs: number
  readonly cost: number
  /** Seconds on the current action; absent when no tool is running. */
  readonly actionSecs?: number
  readonly stuck?: 1
  /** Error text of a failed agent; the graph card shows it, and falls back to `exit 1` when absent. */
  readonly err?: string
}

/** A running agent on the same action for longer than this is flagged as stuck, in ms. */
export const STUCK_AFTER_MS = 180_000

/** Spec rows for every agent in tree order. `now` is the clock used for live elapsed time. */
export const buildRows = (state: SessionState, now: number): Row[] =>
  orderTree(state).map(({ id, depth }) => {
    const agent = state.agents[id]
    const lastAction = agent.recent[agent.recent.length - 1]
    const endedAt = agent.endedAt ?? now
    const isStuck =
      agent.status === 'running' && agent.current !== undefined && now - agent.current.since > STUCK_AFTER_MS
    return {
      id,
      d: depth,
      name: agent.type,
      task: agent.description,
      model: shortModel(agent.model),
      st: agent.status,
      act: agent.current?.summary ?? lastAction?.summary ?? '',
      i: agent.tokens.input,
      o: agent.tokens.output,
      cr: agent.tokens.cacheRead,
      cw: agent.tokens.cacheWrite,
      calls: agent.toolCount,
      secs: Math.max(0, Math.round((endedAt - agent.startedAt) / 1000)),
      cost: costOf(agent.model, agent.tokens),
      ...(agent.current ? { actionSecs: Math.max(0, Math.round((now - agent.current.since) / 1000)) } : {}),
      ...(isStuck ? { stuck: 1 as const } : {}),
    }
  })
