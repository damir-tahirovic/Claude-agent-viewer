import { MAIN, RECENT_MAX, UNKNOWN_AFTER_MS, ZERO, type AgentEvent, type AgentNode, type SessionState } from './model'
import { summarize } from './summary'

const node = (id: string, at: number, overrides: Partial<AgentNode> = {}): AgentNode => ({
  id,
  type: 'agent',
  description: '',
  status: 'running',
  startedAt: at,
  lastSignal: at,
  recent: [],
  toolCount: 0,
  tokens: { ...ZERO },
  parentId: id === MAIN ? undefined : MAIN,
  ...overrides,
})

/** Fresh session with only the main agent, running. */
export const initialState = (sessionId: string, at: number): SessionState => ({
  sessionId,
  startedAt: at,
  agents: { [MAIN]: node(MAIN, at, { type: 'main' }) },
  todos: {},
})

/** Records a signal from an agent; a waiting or unknown agent is running again. */
const alive = (agent: AgentNode, at: number): AgentNode => ({
  ...agent,
  lastSignal: at,
  status: agent.status === 'unknown' || agent.status === 'waiting' ? 'running' : agent.status,
})

const withAgent = (
  state: SessionState,
  id: string,
  at: number,
  update: (agent: AgentNode) => AgentNode,
): SessionState => {
  const agent = state.agents[id] ?? node(id, at)
  return { ...state, agents: { ...state.agents, [id]: update(agent) } }
}

/** A running subagent that has been silent too long is unknown; main never is. */
const isStale = (id: string, agent: AgentNode, at: number): boolean =>
  id !== MAIN && agent.status === 'running' && at - agent.lastSignal > UNKNOWN_AFTER_MS

/** Applies one event and returns the next state; the input is never mutated. */
export const reduce = (state: SessionState, event: AgentEvent): SessionState => {
  switch (event.kind) {
    case 'agent.start':
      return withAgent(state, event.id, event.at, agent => ({
        ...agent,
        type: event.type,
        description: event.description,
        model: event.model ?? agent.model,
        parentId: event.parentId ?? MAIN,
        status: 'running',
        startedAt: event.at,
        lastSignal: event.at,
      }))
    case 'agent.end':
      return withAgent(state, event.id, event.at, agent => ({
        ...agent,
        status: event.ok ? 'done' : 'failed',
        endedAt: event.at,
        current: undefined,
        lastSignal: event.at,
      }))
    case 'tool.start':
      return withAgent(state, event.agentId, event.at, agent => ({
        ...alive(agent, event.at),
        status: 'running',
        toolCount: agent.toolCount + 1,
        current: {
          toolUseId: event.toolUseId,
          tool: event.tool,
          summary: summarize(event.tool, event.input),
          since: event.at,
        },
      }))
    case 'tool.end':
      return withAgent(state, event.agentId, event.at, agent => {
        const finished = agent.current?.toolUseId === event.toolUseId ? agent.current : undefined
        const action = {
          tool: finished?.tool ?? '?',
          summary: finished?.summary ?? '',
          at: finished?.since ?? event.at,
          ok: event.ok,
          ms: finished ? event.at - finished.since : undefined,
        }
        return {
          ...alive(agent, event.at),
          current: finished ? undefined : agent.current,
          recent: [...agent.recent, action].slice(-RECENT_MAX),
        }
      })
    case 'usage':
      return withAgent(state, event.agentId, event.at, agent => ({
        ...alive(agent, event.at),
        model: event.model ?? agent.model,
        tokens: {
          input: agent.tokens.input + event.tokens.input,
          output: agent.tokens.output + event.tokens.output,
          cacheRead: agent.tokens.cacheRead + event.tokens.cacheRead,
          cacheWrite: agent.tokens.cacheWrite + event.tokens.cacheWrite,
        },
      }))
    case 'todos':
      return { ...state, todos: { ...state.todos, [event.agentId]: event.todos } }
    case 'waiting':
      return withAgent(state, event.agentId, event.at, agent => ({
        ...agent,
        status: 'waiting',
        lastSignal: event.at,
      }))
    case 'tick': {
      const entries = Object.entries(state.agents)
      if (!entries.some(([id, agent]) => isStale(id, agent, event.at))) return state
      const agents: Record<string, AgentNode> = {}
      for (const [id, agent] of entries) {
        agents[id] = isStale(id, agent, event.at) ? { ...agent, status: 'unknown' } : agent
      }
      return { ...state, agents }
    }
    default: {
      const unhandled: never = event
      return state
    }
  }
}

/** Agent ids in tree order: depth-first, children sorted by start time. */
export const orderTree = (state: SessionState): string[] => {
  const childrenByParent: Record<string, string[]> = {}
  for (const agent of Object.values(state.agents)) {
    if (agent.parentId) (childrenByParent[agent.parentId] ??= []).push(agent.id)
  }
  for (const children of Object.values(childrenByParent)) {
    children.sort((a, b) => state.agents[a].startedAt - state.agents[b].startedAt)
  }
  const order: string[] = []
  const visit = (id: string): void => {
    order.push(id)
    const children = childrenByParent[id] ?? []
    children.forEach(childId => visit(childId))
  }
  visit(MAIN)
  return order
}
