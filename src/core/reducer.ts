import { HEARTBEAT_MIN_MS, MAIN, RECENT_MAX, UNKNOWN_AFTER_MS, ZERO, type AgentEvent, type AgentNode, type SessionState, type Todo, type ToolCall } from './model'
import { isSameBilling } from './billing'
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

/** Fresh session with only the main agent, idle as between turns; the first turn or tool call revives it. */
export const initialState = (sessionId: string, at: number): SessionState => ({
  sessionId,
  startedAt: at,
  agents: { [MAIN]: node(MAIN, at, { type: 'main', status: 'done', endedAt: at }) },
  todos: {},
  billing: { kind: 'unknown' },
})

/** Records a signal from an agent; a waiting or unknown agent is running again. */
const alive = (agent: AgentNode, at: number): AgentNode => {
  const isRevived = agent.status === 'unknown' || agent.status === 'waiting'
  return { ...agent, lastSignal: at, status: isRevived ? 'running' : agent.status }
}

const withAgent = (
  state: SessionState,
  id: string,
  at: number,
  update: (agent: AgentNode) => AgentNode,
): SessionState => {
  const agent = state.agents[id] ?? node(id, at)
  return { ...state, agents: { ...state.agents, [id]: update(agent) } }
}

const hasOpenCalls = (agent: AgentNode): boolean => Object.keys(agent.open ?? {}).length > 0

/** A running subagent silent too long, with no tool in flight, is unknown; main never is. */
const isStale = (id: string, agent: AgentNode, at: number): boolean =>
  id !== MAIN && agent.status === 'running' && !hasOpenCalls(agent) && at - agent.lastSignal > UNKNOWN_AFTER_MS

/** The most recently started call among the open ones; a later insertion wins a tie. */
const latestCall = (open: Readonly<Record<string, ToolCall>>): ToolCall | undefined =>
  Object.values(open).reduce<ToolCall | undefined>(
    (best, call) => (best === undefined || call.since >= best.since ? call : best),
    undefined,
  )

/** Applies one event and returns the next state; the input is never mutated. */
export const reduce = (state: SessionState, event: AgentEvent): SessionState => {
  switch (event.kind) {
    case 'agent.start':
      return withAgent(state, event.id, event.at, agent => ({
        ...agent,
        type: event.type,
        description: event.description,
        model: event.model ?? agent.model,
        // Main never has a parent, and an agent cannot be its own parent.
        parentId: event.id === MAIN ? undefined : event.parentId && event.parentId !== event.id ? event.parentId : MAIN,
        status: 'running',
        startedAt: event.at,
        endedAt: undefined,
        lastSignal: event.at,
      }))
    case 'agent.end':
      return withAgent(state, event.id, event.at, agent => ({
        ...agent,
        // A failure reported later still wins over done; a later success never undoes a failure.
        status: !event.ok || agent.status === 'failed' ? 'failed' : 'done',
        endedAt: agent.endedAt ?? event.at,
        current: undefined,
        open: undefined,
        lastSignal: event.at,
      }))
    case 'tool.start':
      return withAgent(state, event.agentId, event.at, agent => {
        const call: ToolCall = {
          toolUseId: event.toolUseId,
          tool: event.tool,
          summary: summarize(event.tool, event.input),
          since: event.at,
        }
        return {
          ...alive(agent, event.at),
          status: 'running',
          endedAt: undefined,
          toolCount: agent.toolCount + 1,
          current: call,
          open: { ...agent.open, [event.toolUseId]: call },
        }
      })
    case 'tool.end':
      return withAgent(state, event.agentId, event.at, agent => {
        const finished = agent.open?.[event.toolUseId] ??
          (agent.current?.toolUseId === event.toolUseId ? agent.current : undefined)
        const { [event.toolUseId]: _closed, ...stillOpen } = agent.open ?? {}
        const action = {
          tool: finished?.tool ?? '?',
          summary: finished?.summary ?? '',
          at: finished?.since ?? event.at,
          ok: event.ok,
          ms: finished ? event.at - finished.since : undefined,
        }
        return {
          ...alive(agent, event.at),
          current: finished ? latestCall(stillOpen) : agent.current,
          open: stillOpen,
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
    case 'task.add': {
      const list = state.todos[event.agentId] ?? []
      if (list.some(todo => todo.id === event.id)) return state
      const added: Todo = { id: event.id, content: event.content, status: 'pending' }
      return { ...state, todos: { ...state.todos, [event.agentId]: [...list, added] } }
    }
    case 'task.set': {
      // Task ids belong to one task list, so the update goes to whichever agent's list holds the id.
      const todos: Record<string, ReadonlyArray<Todo>> = {}
      let isChanged = false
      for (const [agentId, list] of Object.entries(state.todos)) {
        const hit = list.find(todo => todo.id === event.id)
        if (!hit || (event.status !== 'deleted' && hit.status === event.status)) {
          todos[agentId] = list
          continue
        }
        isChanged = true
        todos[agentId] = event.status === 'deleted'
          ? list.filter(todo => todo.id !== event.id)
          : list.map(todo => (todo.id === event.id ? { ...todo, status: event.status as Todo['status'] } : todo))
      }
      return isChanged ? { ...state, todos } : state
    }
    case 'waiting':
      return withAgent(state, event.agentId, event.at, agent => ({
        ...agent,
        status: 'waiting',
        lastSignal: event.at,
      }))
    case 'heartbeat': {
      // The engine's own list says this agent runs: refresh it, but never invent an unseen agent.
      const known = state.agents[event.agentId]
      if (!known) return state
      // A running agent with a tool in flight or a fresh signal needs nothing; the same object means no write.
      if (known.status === 'running' && (hasOpenCalls(known) || event.at - known.lastSignal < HEARTBEAT_MIN_MS)) return state
      return withAgent(state, event.agentId, event.at, agent => alive(agent, event.at))
    }
    case 'turn':
      return withAgent(state, event.agentId, event.at, agent =>
        event.phase === 'start'
          ? { ...agent, status: 'running', endedAt: undefined, lastSignal: event.at }
          : { ...agent, status: 'done', endedAt: event.at, current: undefined, open: undefined, lastSignal: event.at })
    case 'tick': {
      const entries = Object.entries(state.agents)
      if (!entries.some(([id, agent]) => isStale(id, agent, event.at))) return state
      const agents: Record<string, AgentNode> = {}
      for (const [id, agent] of entries) {
        agents[id] = isStale(id, agent, event.at) ? { ...agent, status: 'unknown' } : agent
      }
      return { ...state, agents }
    }
    case 'billing':
      // A subscription never reverts: an empty rate-limit reading must not flip it to api and show cost.
      if (state.billing?.kind === 'subscription' && event.billing.kind !== 'subscription') return state
      // The same object back means nothing changed, so the poll-free path writes nothing.
      return state.billing && isSameBilling(state.billing, event.billing) ? state : { ...state, billing: event.billing }
    default: {
      const unhandled: never = event
      return state
    }
  }
}

/** One agent in tree order with its depth (main is 0). */
export type TreeEntry = { readonly id: string; readonly depth: number }

/**
 * Agents in tree order: depth-first, children sorted by start time. An agent whose parent is
 * unknown or unreachable (an orphan or a cycle) hangs under main at depth 1; each agent appears once.
 */
export const orderTree = (state: SessionState): ReadonlyArray<TreeEntry> => {
  const childrenByParent: Record<string, string[]> = {}
  for (const agent of Object.values(state.agents)) {
    if (agent.id !== MAIN && agent.parentId) (childrenByParent[agent.parentId] ??= []).push(agent.id)
  }
  const byStart = (a: string, b: string): number => state.agents[a].startedAt - state.agents[b].startedAt
  for (const children of Object.values(childrenByParent)) children.sort(byStart)
  const order: TreeEntry[] = []
  const visited = new Set<string>()
  const visit = (id: string, depth: number): void => {
    if (visited.has(id)) return
    visited.add(id)
    order.push({ id, depth })
    for (const childId of childrenByParent[id] ?? []) visit(childId, depth + 1)
  }
  if (state.agents[MAIN]) visit(MAIN, 0)
  Object.keys(state.agents).filter(id => !visited.has(id)).sort(byStart).forEach(id => visit(id, 1))
  return order
}
