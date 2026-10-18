import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { AgentEvent, SessionState } from '../src/core/model'
import { initialState, orderTree, reduce } from '../src/core/reducer'
import { listStatus, spawnStart, stepUsage, toolEnd, toolStart, turnComplete, turnStart } from '../src/mod/adapter'
import { buildPaneView, roomFor } from '../src/mod/pane-view'
import { panColumn, panToInclude } from '../src/mod/graph-pane'
import { decideClose, nextWindow, stepId, type CloseDecision } from '../src/mod/pane-keys'
import { COLOR_OF_CODE, runs } from '../src/mod/paint'
import { toPlainAscii } from '../src/view/lines'
import { statusFor } from '../src/mod/status-text'
import type { AgentviewSession, AgentviewUi } from '../types'

/** Session snapshot atom; SessionState and AgentviewSession describe the same shape. */
export const session = atom({ plugin: 'agentview', key: 'session' } as const, null as AgentviewSession | null)

/** Pane view state atom. */
export const ui = atom(
  { plugin: 'agentview', key: 'ui' } as const,
  { open: false, view: 'tree', selId: 'main', mode: 'tree', graphCol: 0, spin: 0 } as AgentviewUi,
)

const PANE_ID = 'agentview'
const SPIN_MS = 125
const SPIN_FRAMES = 10
/** Keys of the detail view's two step Buttons; agent ids never collide with these. */
const PREV_KEY = '<prev>'
const NEXT_KEY = '>next<'
/** Keys of the graph footer Buttons and the header toggle; none is an agent id. */
const GRAPH_PREV_KEY = '<graph-prev>'
const GRAPH_NEXT_KEY = '>graph-next<'
const GRAPH_DETAILS_KEY = '<graph-details>'
const PAN_LEFT_KEY = '<pan-left>'
const PAN_RIGHT_KEY = '>pan-right<'
const TREE_MODE_KEY = 'tree'
const GRAPH_MODE_KEY = 'graph'
const FALLBACK_SESSION_ID = 'session'
const POLL_MS = 1000
const DEFAULT_PANE_ROWS = 24

/** Agent rows that fit in the pane as last drawn; the focus hook has no viewport, so render leaves it here. */
let latestRoom = roomFor(DEFAULT_PANE_ROWS)

/** Last status line sent, so `$.ui.status` is called only when the text changes. A reload re-sends it. */
let lastStatus: string | undefined

/** Wheres already logged in this load; each is logged once so a hot hook cannot flood the transcript. */
const logged = new Set<string>()

/** Logs a swallowed error through `$.ui.log` once per `where`. Never throws. */
const logOnce = ($: EngineInterface, where: string, err: unknown): void => {
  if (logged.has(where)) return
  logged.add(where)
  try {
    $.ui.log(`agentview: ${where}: ${err instanceof Error ? err.message : String(err)}`)
  } catch {
    // Logging is best effort.
  }
}

/** Tail of the recording queue; one queue keeps events in the order the hooks saw them. */
let pending: Promise<void> = Promise.resolve()

/** Queues a recording job so it never delays the host's work; a failing job does not stop the queue. */
const enqueue = (job: () => Promise<void>): void => {
  pending = pending.then(job).catch(() => {})
}

/** Sends the status line when it differs from the last one sent. Never throws. */
const publishStatus = async ($: EngineInterface): Promise<void> => {
  try {
    const current = await read($, session)
    if (!current) return
    const text = statusFor(current, await $.clock.now())
    if (text === lastStatus) return
    lastStatus = text
    $.ui.status(text)
  } catch (err) {
    logOnce($, 'status', err)
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
  } catch (err) {
    logOnce($, 'apply', err)
  }
}

/** Runs `build` on a clock reading and applies its events; builder errors are swallowed too. */
const record = async ($: EngineInterface, build: (at: number) => AgentEvent[]): Promise<void> => {
  try {
    await apply($, build(await $.clock.now()))
  } catch (err) {
    logOnce($, 'record', err)
  }
}

export const register: Register = (on, options) => {
  const known: Record<string, string> = {}
  const isAscii = options.ascii === true
  let spinner: { cancel: () => void } | undefined
  // One poll per mod: a repeated session.start replaces it instead of doubling it.
  let poll: { cancel: () => void } | undefined

  const stopSpinner = (): void => {
    spinner?.cancel()
    spinner = undefined
  }

  on('session.start', async ($, e, next) => {
    // Each step has its own try: one failing must not skip the poll, the command or next(e).
    let at: number | undefined
    try {
      at = await $.clock.now()
    } catch (err) {
      logOnce($, 'session.start clock', err)
    }
    let id = FALLBACK_SESSION_ID
    try {
      id = (await $.session.id()) || FALLBACK_SESSION_ID
    } catch (err) {
      logOnce($, 'session.start id', err)
    }
    // Without a clock reading the state is left to the first event, which reads the clock itself.
    if (at !== undefined) {
      const startedAt = at
      try {
        await update($, session, current => current ?? initialState(id, startedAt))
      } catch (err) {
        logOnce($, 'session.start state', err)
      }
    }
    try {
      poll?.cancel()
      poll = $.clock.every(POLL_MS, async () => {
        try {
          const now = await $.clock.now()
          const list = await $.agent.list()
          await apply($, [...listStatus(list, now, known), { kind: 'tick', at: now }])
          for (const agent of list) known[agent.id] = agent.status
        } catch (err) {
          logOnce($, 'poll', err)
        }
      })
    } catch (err) {
      logOnce($, 'session.start poll', err)
    }
    try {
      await $.command.register({ name: 'agentview', description: 'Live view of agents and subagents' })
    } catch (err) {
      logOnce($, 'session.start command', err)
    }
    return next(e)
  })

  on('command.run', { command: 'agentview' }, async $ => {
    try {
      await update($, ui, current => ({ ...current, open: true, view: 'tree', selId: 'main', graphCol: 0, win: undefined }))
      await $.ui.open({ id: PANE_ID, title: 'agentview', focus: true, closeOnEscape: true, holdToasts: true })
    } catch (err) {
      logOnce($, 'command.run', err)
      return { text: 'agentview could not open' }
    }
    // Started only once the pane is open; it ends itself when the pane is no longer open.
    stopSpinner()
    const timer = $.clock.every(SPIN_MS, async () => {
      try {
        const state = await read($, ui)
        if (!state.open) timer.cancel()
        else await update($, ui, current => ({ ...current, spin: (current.spin + 1) % SPIN_FRAMES }))
      } catch (err) {
        logOnce($, 'spinner', err)
      }
    })
    spinner = timer
    // `text` undefined means the command showed no text: the pane is its output.
    return {}
  })

  on('ui.focus', async ($, e, next) => {
    try {
      const key = e.element
      const state = await read($, ui)
      const snapshot = (await read($, session)) ?? initialState(FALLBACK_SESSION_ID, 0)
      const order = orderTree(snapshot).map(entry => entry.id)
      // Only agent rows move the selection; the toggle and graph Buttons keep their own keys.
      if (e.requestId === PANE_ID && key && state.view === 'tree' && state.mode === 'tree' &&
        order.includes(key) && key !== state.selId) {
        const win = nextWindow(order, key, state.win ?? [0, latestRoom], latestRoom)
        await update($, ui, current => ({ ...current, selId: key, win }))
      }
    } catch (err) {
      logOnce($, 'ui.focus', err)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    let decision: CloseDecision = 'close'
    try {
      decision = decideClose('tree', e.id === PANE_ID, e.origin?.kind === 'person')
      if (decision !== 'pass') {
        decision = decideClose((await read($, ui)).view, true, e.origin?.kind === 'person')
        if (decision === 'back') {
          await update($, ui, current => ({ ...current, view: 'tree' }))
          return { deny: 'back' }
        }
        await update($, ui, current => ({ ...current, open: false }))
      }
    } catch (err) {
      // Our state failing must never keep a pane open.
      logOnce($, 'ui.close', err)
    }
    if (decision !== 'pass') stopSpinner()
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
      session: current, view: state.view, selId: state.selId, mode: state.mode, graphCol: state.graphCol, spin: state.spin,
      now: await $.clock.now(), columns: e.props.bodyColumns, rows: e.viewport?.rows ?? DEFAULT_PANE_ROWS, ascii: isAscii, win: state.win,
    })
    latestRoom = roomFor(e.viewport?.rows ?? DEFAULT_PANE_ROWS, view.isToggleBeside ? 0 : 1)
    const label = (text: string): string => (isAscii ? toPlainAscii(text) : text)
    const step = (offset: number) => async (): Promise<void> => {
      const target = stepId(view.order, state.selId, offset)
      const columns = view.hiddenColumns
      await update($, ui, latest => ({
        ...latest,
        selId: target,
        graphCol: latest.mode === 'graph' && columns
          ? panToInclude(view.outline, target, latest.graphCol, columns.visible)
          : latest.graphCol,
      }))
    }
    const setMode = (mode: 'tree' | 'graph') => async (): Promise<void> => {
      await update($, ui, latest => ({ ...latest, mode }))
    }
    const pan = (offset: number) => async (): Promise<void> => {
      const columns = view.hiddenColumns
      if (columns) await update($, ui, latest => ({ ...latest, graphCol: panColumn(latest.graphCol, offset, columns) }))
    }
    const isGraph = state.mode === 'graph'
    const toggle = (
      <Box>
        <Button key={TREE_MODE_KEY} plain hotkey="t" onPress={setMode('tree')}>
          <Text inverse={!isGraph || undefined} weight={isGraph ? undefined : 'bold'} dimColor={isGraph || undefined}>
            {label(' tree ')}
          </Text>
        </Button>
        <Text> </Text>
        <Button key={GRAPH_MODE_KEY} plain hotkey="g" onPress={setMode('graph')}>
          <Text inverse={isGraph || undefined} weight={isGraph ? 'bold' : undefined} dimColor={!isGraph || undefined}>
            {label(' graph ')}
          </Text>
        </Button>
      </Box>
    )
    const headLines = state.view === 'tree' ? view.head.slice(1) : view.head
    return (
      <Box flexDirection="column">
        {state.view === 'tree' && (
          view.isToggleBeside
            ? <Box>{paintLine(view.head[0])}<Text>  </Text>{toggle}</Box>
            : <Box flexDirection="column">{paintLine(view.head[0])}{toggle}</Box>
        )}
        {headLines.map(paintLine)}
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
        {state.view === 'tree' && isGraph && (
          <Box>
            <Button key={GRAPH_PREV_KEY} plain hotkey="p" onPress={step(-1)}><Text dimColor>{label('◂ prev')}</Text></Button>
            <Text>  </Text>
            <Button key={GRAPH_NEXT_KEY} plain hotkey="n" onPress={step(1)}><Text dimColor>{label('next ▸')}</Text></Button>
            <Text>  </Text>
            <Button
              key={GRAPH_DETAILS_KEY}
              plain
              autoFocus
              hotkey="d"
              onPress={async () => { await update($, ui, latest => ({ ...latest, view: 'detail' })) }}
            >
              <Text dimColor>{label('⏎ details')}</Text>
            </Button>
            {view.hiddenColumns && (
              <Box>
                <Text>  </Text>
                <Button key={PAN_LEFT_KEY} plain hotkey="h" onPress={pan(-1)}><Text dimColor>{label('◂◂')}</Text></Button>
                <Text> </Text>
                <Button key={PAN_RIGHT_KEY} plain hotkey="l" onPress={pan(1)}><Text dimColor>{label('▸▸')}</Text></Button>
              </Box>
            )}
          </Box>
        )}
        {state.view === 'detail' && (
          <Box>
            <Button key={PREV_KEY} plain onPress={step(-1)}><Text dimColor>{label('◂ prev agent')}</Text></Button>
            <Text>  </Text>
            <Button key={NEXT_KEY} plain autoFocus onPress={step(1)}><Text dimColor>{label('next agent ▸')}</Text></Button>
          </Box>
        )}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    enqueue(() => record($, at => toolStart(e, at)))
    // The call is not awaited by the recorder; the end is recorded however it finishes.
    let result: Awaited<ReturnType<typeof next>> | undefined
    try {
      result = await next(e)
      return result
    } finally {
      const finished = result
      enqueue(() => record($, at => toolEnd(e, finished ?? { isError: true }, at)))
    }
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    enqueue(() => record($, at => spawnStart(e, result ?? {}, at)))
    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    enqueue(() => record($, at => turnStart(e, at)))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    enqueue(() => record($, at => stepUsage(e, result?.usage ?? null, at)))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    enqueue(() => record($, at => turnComplete(e, at)))
    return result
  })
}
