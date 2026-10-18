import type { AgentEvent } from '../core/model'

/** Appends `added` after `queued` in order and keeps only the newest `limit` events, so a stuck flush cannot grow without bound. */
export const appendBounded = (
  queued: ReadonlyArray<AgentEvent>,
  added: ReadonlyArray<AgentEvent>,
  limit: number,
): AgentEvent[] => [...queued, ...added].slice(-limit)
