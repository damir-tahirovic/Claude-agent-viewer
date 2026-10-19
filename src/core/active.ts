import { MAIN } from './model'
import type { AgentNode, SessionState } from './model'

/** Which agents the views list: every one, or only those still working or finished recently. */
export type AgentFilter = 'all' | 'active'

/** A finished agent stays visible under the active filter this long after it ended, in ms. */
export const KEEP_FINISHED_MS = 60_000

/** True when a finished agent ended recently enough to stay listed. */
const isRecentlyFinished = (agent: AgentNode, now: number): boolean =>
  agent.endedAt !== undefined && now - agent.endedAt < KEEP_FINISHED_MS

/** True when the agent is working, or finished within the keep window. */
const isActive = (agent: AgentNode, now: number): boolean =>
  agent.status === 'done' || agent.status === 'failed' ? isRecentlyFinished(agent, now) : true

/** Drops old finished agents (keeping main and every ancestor of a kept agent); counts what was dropped. */
export const activeOnly = (
  state: SessionState,
  now: number,
): { readonly state: SessionState; readonly hiddenCount: number } => {
  const kept = new Set<string>([MAIN])
  for (const agent of Object.values(state.agents)) {
    if (!isActive(agent, now)) continue
    // Walk up the parents; the set also stops a malformed cycle.
    let at: AgentNode | undefined = agent
    while (at !== undefined && !kept.has(at.id)) {
      kept.add(at.id)
      at = at.parentId === undefined ? undefined : state.agents[at.parentId]
    }
  }
  const ids = Object.keys(state.agents)
  const hiddenCount = ids.filter(id => !kept.has(id)).length
  if (hiddenCount === 0) return { state, hiddenCount }
  const agents = Object.fromEntries(ids.filter(id => kept.has(id)).map(id => [id, state.agents[id]]))
  return { state: { ...state, agents }, hiddenCount }
}

/** True while some finished subagent is inside the keep window, so the caller must redraw later to hide it. */
export const hasPendingExpiry = (state: SessionState, now: number): boolean =>
  Object.values(state.agents).some(agent =>
    agent.id !== MAIN && (agent.status === 'done' || agent.status === 'failed') && isRecentlyFinished(agent, now))
