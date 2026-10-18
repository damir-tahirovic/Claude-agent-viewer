// State contract of agentview: the shape of its atoms in `$.state`.
// Self-contained on purpose (a contract file imports nothing); keep SessionState in step with src/core/model.ts.

/** Token counts for one agent. */
export type AgentviewTokens = {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/** One agent of the session snapshot (mirrors AgentNode in src/core/model.ts). */
export type AgentviewAgent = {
  readonly id: string
  readonly parentId?: string
  readonly type: string
  readonly description: string
  readonly model?: string
  readonly status: 'running' | 'waiting' | 'done' | 'failed' | 'unknown'
  readonly startedAt: number
  readonly endedAt?: number
  readonly lastSignal: number
  readonly current?: {
    readonly toolUseId: string
    readonly tool: string
    readonly summary: string
    readonly since: number
  }
  readonly recent: ReadonlyArray<{
    readonly tool: string
    readonly summary: string
    readonly at: number
    readonly ok: boolean | null
    readonly ms?: number
  }>
  readonly toolCount: number
  readonly tokens: AgentviewTokens
}

/** Whole session snapshot (mirrors SessionState in src/core/model.ts). */
export type AgentviewSession = {
  readonly sessionId: string
  readonly startedAt: number
  readonly agents: Readonly<Record<string, AgentviewAgent>>
  readonly todos: Readonly<Record<string, ReadonlyArray<{
    readonly content: string
    readonly status: 'pending' | 'in_progress' | 'completed'
  }>>>
}

/** Pane view state. */
export type AgentviewUi = {
  open: boolean
  view: 'tree' | 'detail'
  selId: string
  win?: [number, number]
  spin: number
}

declare module 'claude-code' {
  interface PluginState {
    agentview: { session: AgentviewSession | null; ui: AgentviewUi }
  }
}
