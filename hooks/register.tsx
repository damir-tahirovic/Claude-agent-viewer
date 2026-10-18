import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { AgentEvent, SessionState } from '../src/core/model'
import { initialState, reduce } from '../src/core/reducer'
import { listStatus, spawnStart, stepUsage, toolEnd, toolStart, turnComplete } from '../src/mod/adapter'
import { buildPaneView } from '../src/mod/pane-view'
import { decideClose, stepId } from '../src/mod/pane-keys'
import { COLOR_OF_CODE, runs } from '../src/mod/paint'
import { statusFor } from '../src/mod/status-text'
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

/** Last status line sent, so `$.ui.status` is called only when the text changes. A reload re-sends it. */
let lastStatus: string | undefined

/** Sends the status line when it differs from the last one sent. Never throws. */
const publishStatus = async ($: EngineInterface): Promise<void> => {
  try {
    const current = await read($, session)
    if (!current) return
    const text = statusFor(current, await $.clock.now())
    if (text === lastStatus) return
    lastStatus = text
    $.ui.status(text)
  } catch {
    // The status line is a nicety; failing to draw it must not matter.
  }
}

/** Folds events into the session atom. Never throws: a bug here must not touch the host's work. */
const apply = async ($: EngineInterface, events: ReadonlyArray<AgentEvent>): Promise<void> => {
  if (events.length === 0) return
  try {
    const at = await $.clock.now()
    await update($, session, current => {
      const base: SessionState = current ?? initialState(FALLBACK_SESSION_ID, at)
      return events.reduce(reduce, base)
    })
    await publishStatus($)
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
    await $.ui.open({ id: PANE_ID, title: 'agentview', focus: true, closeOnEscape: true, holdToasts: true })
    // Started only once the pane is open; it ends itself when the pane is no longer open.
    stopSpinner()
    const timer = $.clock.every(SPIN_MS, async () => {
      try {
        const state = await read($, ui)
        if (!state.open) timer.cancel()
        else await update($, ui, current => ({ ...current, spin: (current.spin + 1) % SPIN_FRAMES }))
      } catch {
        // A missed frame is harmless.
      }
    })
    spinner = timer
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
    let decision = decideClose('tree', e.id === PANE_ID, e.origin.kind === 'person')
    if (decision === 'pass') return next(e)
    try {
      decision = decideClose((await read($, ui)).view, true, e.origin.kind === 'person')
      if (decision === 'back') {
        await update($, ui, current => ({ ...current, view: 'tree' }))
        return { deny: 'back' }
      }
      await update($, ui, current => ({ ...current, open: false }))
    } catch {
      // Our state failing must never keep a pane open.
    }
    stopSpinner()
    return next(e)
  }).catch(($, e, next) => next(e))

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
    const step = (offset: number) => async (): Promise<void> => {
      const target = stepId(view.order, state.selId, offset)
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
