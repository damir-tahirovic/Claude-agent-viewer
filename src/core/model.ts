/** Lifecycle state of one agent as shown in the tree. */
export type AgentStatus = 'running' | 'waiting' | 'done' | 'failed' | 'unknown'

/** Token counts for one agent or one usage report. */
export type Tokens = {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/** One finished tool call in an agent's recent history. */
export type Action = {
  readonly tool: string
  readonly summary: string
  readonly at: number
  readonly ok: boolean | null
  readonly ms?: number
}

/** One entry of the agent's todo list. */
export type Todo = {
  /** Task id from TaskCreate; absent for TodoWrite items. */
  readonly id?: string
  readonly content: string
  readonly status: 'pending' | 'in_progress' | 'completed'
}

/** One tool call that has started and not yet ended. */
export type ToolCall = {
  readonly toolUseId: string
  readonly tool: string
  readonly summary: string
  readonly since: number
}

/** One agent (the main session or a subagent) with its live state. */
export type AgentNode = {
  readonly id: string
  readonly parentId?: string
  readonly type: string
  readonly description: string
  readonly model?: string
  readonly status: AgentStatus
  readonly startedAt: number
  readonly endedAt?: number
  readonly lastSignal: number
  /** The most recently started call that is still open. */
  readonly current?: ToolCall
  /** Every open call by tool use id; parallel tools overlap here. */
  readonly open?: Readonly<Record<string, ToolCall>>
  readonly recent: ReadonlyArray<Action>
  readonly toolCount: number
  readonly tokens: Tokens
  /** True when a usage report arrived without its final output count, so `tokens.output` is a lower bound. */
  readonly isOutputPartial?: true
}

/** One usage window of a subscription, as the engine reports it (`five_hour`, `seven_day`, ...). */
export type UsageLimit = { readonly kind: string; readonly percentUsed: number }

/** How the session is paid for: a plan with usage limits, an API key with per-token cost, or not known yet. */
export type Billing =
  | { readonly kind: 'subscription'; readonly limits: ReadonlyArray<UsageLimit> }
  | { readonly kind: 'api' }
  | { readonly kind: 'unknown' }

/** Whole session snapshot: every agent and every agent's todos. */
export type SessionState = {
  readonly sessionId: string
  readonly startedAt: number
  readonly agents: Readonly<Record<string, AgentNode>>
  readonly todos: Readonly<Record<string, ReadonlyArray<Todo>>>
  /** Absent means API billing, so renderers and fixtures without it show cost. */
  readonly billing?: Billing
}

/** Normalized input event; the only thing the reducer consumes. */
export type AgentEvent =
  | {
      readonly kind: 'agent.start'
      readonly at: number
      readonly id: string
      readonly parentId?: string
      readonly type: string
      readonly description: string
      readonly model?: string
    }
  | { readonly kind: 'agent.end'; readonly at: number; readonly id: string; readonly ok: boolean }
  | {
      readonly kind: 'tool.start'
      readonly at: number
      readonly agentId: string
      readonly toolUseId: string
      readonly tool: string
      readonly input: unknown
    }
  | {
      readonly kind: 'tool.end'
      readonly at: number
      readonly agentId: string
      readonly toolUseId: string
      readonly ok: boolean
    }
  | {
      readonly kind: 'usage'
      readonly at: number
      readonly agentId: string
      readonly model?: string
      readonly tokens: Tokens
      /** False when the response never reported its final output count; `tokens.output` is then 0, not a measure. */
      readonly isOutputKnown?: false
    }
  | { readonly kind: 'todos'; readonly at: number; readonly agentId: string; readonly todos: ReadonlyArray<Todo> }
  | { readonly kind: 'task.add'; readonly at: number; readonly agentId: string; readonly id: string; readonly content: string }
  | {
      readonly kind: 'task.set'
      readonly at: number
      readonly id: string
      readonly status: Todo['status'] | 'deleted'
    }
  | { readonly kind: 'waiting'; readonly at: number; readonly agentId: string }
  | { readonly kind: 'heartbeat'; readonly at: number; readonly agentId: string }
  | { readonly kind: 'turn'; readonly at: number; readonly agentId: typeof MAIN; readonly phase: 'start' | 'end' }
  | { readonly kind: 'tick'; readonly at: number }
  | { readonly kind: 'billing'; readonly at: number; readonly billing: Billing }

/** Id of the main session agent. */
export const MAIN = 'main'

/** All-zero token counts. */
export const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** How many finished actions each agent keeps. */
export const RECENT_MAX = 20

/** Silence after which a running subagent is marked unknown, in ms. */
export const UNKNOWN_AFTER_MS = 60_000

/** A heartbeat refreshes a running agent's signal only after this much silence, so the poll writes rarely. */
export const HEARTBEAT_MIN_MS = 30_000
