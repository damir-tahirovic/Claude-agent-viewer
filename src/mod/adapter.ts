import { MAIN, type AgentEvent, type Todo, type Tokens } from '../core/model'

// Narrow local shapes: the engine's event types live in 'claude-code', which only hooks/ may import.

/** A tool.call event as far as the adapter reads it; tool arguments are flattened on it. */
export type ToolCallInput = {
  readonly tool: string
  readonly tool_use_id?: string
  readonly agentId?: string
  readonly [key: string]: unknown
}

/** What the adapter reads from a tool.call answer. */
export type ToolCallResult = {
  readonly isError?: boolean
  readonly deny?: string
  readonly result?: unknown
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const isAgentTool = (tool: string): boolean => tool === 'Agent' || tool === 'Task'

const TODO_STATUSES: ReadonlyArray<string> = ['pending', 'in_progress', 'completed']

const toTodos = (value: unknown): ReadonlyArray<Todo> | null => {
  if (!Array.isArray(value)) return null
  const todos: Todo[] = []
  for (const item of value as ReadonlyArray<unknown>) {
    if (!isRecord(item) || typeof item.content !== 'string') return null
    const status = typeof item.status === 'string' && TODO_STATUSES.includes(item.status) ? item.status : 'pending'
    todos.push({ content: item.content, status: status as Todo['status'] })
  }
  return todos
}

/** A tool call began: tool.start, plus todos for TodoWrite. */
export const toolStart = (e: ToolCallInput, at: number): AgentEvent[] => {
  const agentId = e.agentId ?? MAIN
  const events: AgentEvent[] = [
    { kind: 'tool.start', at, agentId, toolUseId: e.tool_use_id ?? '', tool: e.tool, input: e },
  ]
  if (e.tool === 'TodoWrite') {
    const todos = toTodos(e.todos)
    if (todos) events.push({ kind: 'todos', at, agentId, todos })
  }
  return events
}

/** A tool call finished: tool.end, plus agent.end for a foreground Agent/Task result. */
export const toolEnd = (e: ToolCallInput, r: ToolCallResult, at: number): AgentEvent[] => {
  const events: AgentEvent[] = [
    {
      kind: 'tool.end',
      at,
      agentId: e.agentId ?? MAIN,
      toolUseId: e.tool_use_id ?? '',
      ok: !r.isError && !r.deny,
    },
  ]
  // A background agent returns async_launched at once; it is still running then.
  if (isAgentTool(e.tool) && isRecord(r.result) && typeof r.result.agentId === 'string' && r.result.status !== 'async_launched') {
    events.push({ kind: 'agent.end', at, id: r.result.agentId, ok: !r.isError && !r.deny })
  }
  return events
}

/** A subagent was spawned: agent.start, or nothing when the engine gave no id. */
export const spawnStart = (
  e: { subagentType: string; description?: string; parentAgentId?: string },
  r: { agentId?: string; model?: string },
  at: number,
): AgentEvent[] =>
  r.agentId === undefined
    ? []
    : [
        {
          kind: 'agent.start',
          at,
          id: r.agentId,
          parentId: e.parentAgentId ?? MAIN,
          type: e.subagentType,
          description: e.description ?? '',
          model: r.model,
        },
      ]

const count = (value: unknown): number => (typeof value === 'number' ? value : 0)

/** A model step reported usage: one usage event, or nothing when usage is null. */
export const stepUsage = (
  e: { agentId?: string; model: string },
  usage: Readonly<Record<string, unknown>> | null,
  at: number,
): AgentEvent[] => {
  if (!usage) return []
  const tokens: Tokens = {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
  }
  return [
    {
      kind: 'usage',
      at,
      agentId: e.agentId ?? MAIN,
      model: typeof usage.model === 'string' ? usage.model : e.model,
      tokens,
    },
  ]
}

/** Status moves seen in the agent list; `known` holds the last status per id (the caller updates it). */
export const listStatus = (
  list: ReadonlyArray<{ id: string; status: string }>,
  at: number,
  known: Readonly<Record<string, string>>,
): AgentEvent[] => {
  const events: AgentEvent[] = []
  for (const agent of list) {
    if (known[agent.id] === agent.status) continue
    if (agent.status === 'completed') events.push({ kind: 'agent.end', at, id: agent.id, ok: true })
    else if (agent.status === 'failed' || agent.status === 'killed')
      events.push({ kind: 'agent.end', at, id: agent.id, ok: false })
    else if (agent.status === 'waiting') events.push({ kind: 'waiting', at, agentId: agent.id })
  }
  return events
}

/** A turn finished: a subagent's turn ends that agent; main's own turn ends nothing. */
export const turnComplete = (e: { agentId?: string; isAborted: boolean }, at: number): AgentEvent[] =>
  e.agentId === undefined ? [] : [{ kind: 'agent.end', at, id: e.agentId, ok: !e.isAborted }]
