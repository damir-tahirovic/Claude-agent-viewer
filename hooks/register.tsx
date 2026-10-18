import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { AgentEvent, SessionState } from '../src/core/model'
import { initialState, reduce } from '../src/core/reducer'
import { listStatus, spawnStart, stepUsage, toolEnd, toolStart, turnComplete } from '../src/mod/adapter'
import { buildPaneView } from '../src/mod/pane-view'
import { COLOR_OF_CODE, runs } from '../src/mod/paint'
import type { AgentviewSession, AgentviewUi } from '../types'

/** Session snapshot atom; SessionState and AgentviewSession describe the same shape. */
export const session = atom({ plugin: 'agentview', key: 'session' } as const, null as AgentviewSession | null)

/** Pane view state atom. */
export const ui = atom(
  { plugin: 'agentview', key: 'ui' } as const,
  { open: false, view: 'tree', selId: 'main', spin: 0 } as AgentviewUi,
)

const PANE_ID = 'agentview'
const SPIN_MS = 125
const SPIN_FRAMES = 10
/** Keys of the detail view's two step Buttons; agent ids never collide with these. */
const PREV_KEY = '<prev>'
const NEXT_KEY = '>next<'
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

export const register: Register = (on, options) => {
  const known: Record<string, string> = {}
  const isAscii = options.ascii === true
  let spinner: { cancel: () => void } | undefined

  const stopSpinner = (): void => {
    spinner?.cancel()
    spinner = undefined
  }

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
    await $.command.register({ name: 'agentview', description: 'Live view of agents and subagents' })
    return next(e)
  })

  on('command.run', { command: 'agentview' }, async $ => {
    await update($, ui, current => ({ ...current, open: true, view: 'tree', selId: 'main' }))
    stopSpinner()
    spinner = $.clock.every(SPIN_MS, () => {
      void update($, ui, current => ({ ...current, spin: (current.spin + 1) % SPIN_FRAMES })).catch(() => undefined)
    })
    await $.ui.open({ id: PANE_ID, title: 'agentview', focus: true, closeOnEscape: true, holdToasts: true })
    return { text: 'agentview opened' }
  })

  on('ui.focus', async ($, e, next) => {
    const key = e.element
    const state = await read($, ui)
    if (e.requestId === PANE_ID && key && state.view === 'tree' && key !== state.selId) {
      await update($, ui, current => ({ ...current, selId: key }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    const state = await read($, ui)
    if (e.id !== PANE_ID) return next(e)
    if (e.origin.kind === 'person' && state.view === 'detail') {
      await update($, ui, current => ({ ...current, view: 'tree' }))
      return { deny: 'back' }
    }
    stopSpinner()
    await update($, ui, current => ({ ...current, open: false }))
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'agentview close failed' }))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [state, current] = await Promise.all([read($, ui), read($, session)])
    const paintLine = (line: string) => (
      <Text>
        {runs(line).map(run => {
          const color = [...run.codes].map(code => COLOR_OF_CODE[code]).find(Boolean)
          return (
            <Text
              color={color}
              dimColor={run.codes.includes('d') || undefined}
              weight={run.codes.includes('B') ? 'bold' : undefined}
              inverse={run.codes.includes('I') || undefined}
            >
              {run.text}
            </Text>
          )
        })}
      </Text>
    )
    if (!current) return <Text dimColor>agentview: waiting for the session to start</Text>
    const view = buildPaneView({
      session: current, view: state.view, selId: state.selId, spin: state.spin,
      now: await $.clock.now(), columns: e.props.bodyColumns, rows: e.viewport?.rows ?? 24, ascii: isAscii,
    })
    const ids = Object.keys(current.agents)
    const step = (offset: number) => async (): Promise<void> => {
      const at = ids.indexOf(state.selId)
      const target = ids[(Math.max(0, at) + offset + ids.length) % ids.length]
      await update($, ui, latest => ({ ...latest, selId: target }))
    }
    return (
      <Box flexDirection="column">
        {view.head.map(paintLine)}
        {view.agentLines.map(entry => (
          <Button
            key={entry.id}
            plain
            autoFocus={entry.id === state.selId ? true : undefined}
            onPress={async () => { await update($, ui, latest => ({ ...latest, view: 'detail', selId: entry.id })) }}
          >
            {paintLine(entry.line)}
          </Button>
        ))}
        {view.tail.map(paintLine)}
        {state.view === 'detail' && (
          <Box>
            <Button key={PREV_KEY} plain onPress={step(-1)}><Text dimColor>◂ prev agent</Text></Button>
            <Text>  </Text>
            <Button key={NEXT_KEY} plain autoFocus onPress={step(1)}><Text dimColor>next agent ▸</Text></Button>
          </Box>
        )}
      </Box>
    )
  }).catch(($, e, next) => next(e))

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
