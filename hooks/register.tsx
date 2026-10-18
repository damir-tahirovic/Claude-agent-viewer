import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { AgentEvent, SessionState } from '../src/core/model'
import { initialState, reduce } from '../src/core/reducer'
import { listStatus, spawnStart, stepUsage, toolEnd, toolStart, turnComplete } from '../src/mod/adapter'
import type { AgentviewSession } from '../types'

/** Session snapshot atom; SessionState and AgentviewSession describe the same shape. */
export const session = atom({ plugin: 'agentview', key: 'session' } as const, null as AgentviewSession | null)

const FALLBACK_SESSION_ID = 'session'
const POLL_MS = 1000

/** Folds events into the session atom. Never throws: a bug here must not touch the host's work. */
const apply = async ($: EngineInterface, events: ReadonlyArray<AgentEvent>): Promise<void> => {
  if (events.length === 0) return
  try {
    const at = await $.clock.now()
    await update($, session, current => {
      const base: SessionState = current ?? initialState(FALLBACK_SESSION_ID, at)
      return events.reduce(reduce, base)
    })
  } catch {
    // Our own state failing is not the host's problem.
  }
}

/** Runs `build` on a clock reading and applies its events; builder errors are swallowed too. */
const record = async ($: EngineInterface, build: (at: number) => AgentEvent[]): Promise<void> => {
  try {
    await apply($, build(await $.clock.now()))
  } catch {
    // Adapter or clock failure: skip this update.
  }
}

export const register: Register = on => {
  const known: Record<string, string> = {}

  on('session.start', async ($, e, next) => {
    try {
      const at = await $.clock.now()
      const id = await $.session.id()
      await update($, session, current => current ?? initialState(id || FALLBACK_SESSION_ID, at))
      $.clock.every(POLL_MS, async () => {
        try {
          const now = await $.clock.now()
          const list = await $.agent.list()
          await apply($, [...listStatus(list, now, known), { kind: 'tick', at: now }])
          for (const agent of list) known[agent.id] = agent.status
        } catch {
          // Polling is best effort.
        }
      })
    } catch {
      // Setup failed; the hooks below still create the state on first event.
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await record($, at => toolStart(e, at))
    const result = await next(e)
    await record($, at => toolEnd(e, result, at))
    return result
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await record($, at => spawnStart(e, result, at))
    return result
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    await record($, at => stepUsage(e, result.usage, at))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await record($, at => turnComplete(e, at))
    return result
  })
}
