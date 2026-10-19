import { MAIN, type AgentEvent, type Todo, type Tokens } from '../core/model'

// Pure: turns Claude Code transcript records (JSONL) into AgentEvent. No Node APIs, no clock.
// Transcript records have no published types, so every shape is read as `unknown` and narrowed here.

/** What the parser remembers between records of one file. */
export type ParseState = {
  /** Assistant message ids whose usage was already counted (one API response spans several records). */
  readonly seenMessageIds: ReadonlySet<string>
  /** Tool name by tool_use id, so a tool_result knows which tool it answers. */
  readonly toolNames: Readonly<Record<string, string>>
  /** Input of TaskCreate / TaskUpdate calls by tool_use id; their task events need it at result time. */
  readonly taskInputs: Readonly<Record<string, unknown>>
}

/** Fresh parser state for a file that has not been read yet. */
export const initialParseState = (): ParseState => ({ seenMessageIds: new Set(), toolNames: {}, taskInputs: {} })

type Json = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const count = (value: unknown): number => (typeof value === 'number' ? value : 0)

const TODO_STATUSES: ReadonlyArray<string> = ['pending', 'in_progress', 'completed']
const TASK_STATUSES: ReadonlyArray<string> = [...TODO_STATUSES, 'deleted']

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

const toTokens = (usage: Json): Tokens => ({
  input: count(usage.input_tokens),
  output: count(usage.output_tokens),
  cacheRead: count(usage.cache_read_input_tokens),
  cacheWrite: count(usage.cache_creation_input_tokens),
})

const isAgentTool = (tool: string | undefined): boolean => tool === 'Agent' || tool === 'Task'

/** Events for an assistant record: tool starts, todos, usage once per message id, and a heartbeat. */
const assistantEvents = (state: ParseState, record: Json, agentId: string, at: number): { state: ParseState; events: AgentEvent[] } => {
  const message = isRecord(record.message) ? record.message : {}
  const events: AgentEvent[] = []
  const toolNames: Record<string, string> = { ...state.toolNames }
  const taskInputs: Record<string, unknown> = { ...state.taskInputs }
  const blocks: ReadonlyArray<unknown> = Array.isArray(message.content) ? message.content : []
  for (const block of blocks) {
    if (!isRecord(block) || block.type !== 'tool_use') continue
    const toolUseId = asString(block.id)
    const tool = asString(block.name)
    if (toolUseId === undefined || tool === undefined) continue
    toolNames[toolUseId] = tool
    events.push({ kind: 'tool.start', at, agentId, toolUseId, tool, input: block.input })
    if (tool === 'TaskCreate' || tool === 'TaskUpdate') taskInputs[toolUseId] = block.input
    if (tool === 'TodoWrite') {
      const todos = isRecord(block.input) ? toTodos(block.input.todos) : null
      if (todos) events.push({ kind: 'todos', at, agentId, todos })
    }
  }
  const messageId = asString(message.id)
  const isNewMessage = messageId !== undefined && !state.seenMessageIds.has(messageId)
  const seenMessageIds = isNewMessage ? new Set([...state.seenMessageIds, messageId]) : state.seenMessageIds
  if (isNewMessage && isRecord(message.usage)) {
    events.push({ kind: 'usage', at, agentId, model: asString(message.model), tokens: toTokens(message.usage) })
  }
  events.push({ kind: 'heartbeat', at, agentId })
  return { state: { seenMessageIds, toolNames, taskInputs }, events }
}

/** Task list change from a finished TaskCreate / TaskUpdate; the id of a created task is the engine's own. */
const taskEvents = (tool: string | undefined, input: unknown, result: unknown, agentId: string, at: number): AgentEvent[] => {
  if (!isRecord(input)) return []
  if (tool === 'TaskCreate') {
    const task = isRecord(result) ? result.task : undefined
    if (!isRecord(task) || typeof task.id !== 'string' || typeof input.subject !== 'string') return []
    return [{ kind: 'task.add', at, agentId, id: task.id, content: input.subject }]
  }
  if (tool === 'TaskUpdate') {
    if (isRecord(result) && result.success === false) return []
    if (typeof input.taskId !== 'string' || typeof input.status !== 'string' || !TASK_STATUSES.includes(input.status)) return []
    return [{ kind: 'task.set', at, id: input.taskId, status: input.status as Todo['status'] | 'deleted' }]
  }
  return []
}

/** Events for a user record: a main prompt starts a turn; tool_result blocks end tools. */
const userEvents = (state: ParseState, record: Json, agentId: string, at: number): { state: ParseState; events: AgentEvent[] } => {
  const message = isRecord(record.message) ? record.message : {}
  const content = message.content
  if (typeof content === 'string') {
    // isMeta and system-injected text (<task-notification>, <command-name>) are not something the user typed.
    const isPrompt = record.isMeta !== true && !content.startsWith('<')
    const events: AgentEvent[] = isPrompt && agentId === MAIN ? [{ kind: 'turn', at, agentId: MAIN, phase: 'start' }] : []
    return { state, events }
  }
  if (!Array.isArray(content)) return { state, events: [] }
  const events: AgentEvent[] = []
  for (const block of content as ReadonlyArray<unknown>) {
    if (!isRecord(block) || block.type !== 'tool_result') continue
    const toolUseId = asString(block.tool_use_id)
    if (toolUseId === undefined) continue
    const ok = block.is_error !== true
    const tool = state.toolNames[toolUseId]
    events.push({ kind: 'tool.end', at, agentId, toolUseId, ok })
    const result = record.toolUseResult
    // Only a completed Agent result is an end; async_launched means the agent keeps running.
    if (isAgentTool(tool) && isRecord(result) && result.status === 'completed' && typeof result.agentId === 'string') {
      events.push({ kind: 'agent.end', at, id: result.agentId, ok })
    }
    if (ok) events.push(...taskEvents(tool, state.taskInputs[toolUseId], result, agentId, at))
  }
  return { state, events }
}

const NOTIFICATION_ID = /<task-id>([^<]+)<\/task-id>/
const NOTIFICATION_STATUS = /<status>([^<]+)<\/status>/

/** A background agent's task-notification: its end, ok only for `completed`. */
const notificationEvents = (record: Json, at: number): AgentEvent[] => {
  const content = asString(record.content)
  if (record.operation !== 'enqueue' || content === undefined || !content.includes('<task-notification>')) return []
  const id = NOTIFICATION_ID.exec(content)?.[1]?.trim()
  const status = NOTIFICATION_STATUS.exec(content)?.[1]?.trim()
  if (!id || !status) return []
  return [{ kind: 'agent.end', at, id, ok: status === 'completed' }]
}

/** Parses one transcript record; unknown shapes and records without a valid timestamp give no events. */
export const parseRecord = (
  state: ParseState,
  record: unknown,
  agentId: string,
): { state: ParseState; events: AgentEvent[] } => {
  const none = { state, events: [] }
  if (!isRecord(record) || typeof record.timestamp !== 'string') return none
  const at = Date.parse(record.timestamp)
  if (Number.isNaN(at)) return none
  switch (record.type) {
    case 'assistant':
      return assistantEvents(state, record, agentId, at)
    case 'user':
      return userEvents(state, record, agentId, at)
    case 'system':
      return record.subtype === 'turn_duration' && agentId === MAIN
        ? { state, events: [{ kind: 'turn', at, agentId: MAIN, phase: 'end' }] }
        : none
    case 'queue-operation':
      return { state, events: notificationEvents(record, at) }
    default:
      return none
  }
}

/** The agent.start for a subagent's meta file; null when the meta is not an object. */
export const metaStart = (meta: unknown, agentId: string, at: number): AgentEvent | null => {
  if (!isRecord(meta)) return null
  return {
    kind: 'agent.start',
    at,
    id: agentId,
    parentId: asString(meta.parentAgentId) ?? MAIN,
    type: asString(meta.agentType) ?? 'agent',
    description: asString(meta.description) ?? '',
    model: asString(meta.model),
  }
}

/** Parses newline-separated records in order, skipping blank and invalid JSON lines. */
export const parseLines = (
  state: ParseState,
  text: string,
  agentId: string,
): { state: ParseState; events: AgentEvent[] } => {
  let current = state
  const events: AgentEvent[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    const result = parseRecord(current, record, agentId)
    current = result.state
    events.push(...result.events)
  }
  return { state: current, events }
}
