import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { AgentEvent, SessionState } from '../src/core/model'
import { initialState, orderTree, reduce } from '../src/core/reducer'
import { billingEvent, listStatus, spawnStart, stepUsage, toolEnd, toolStart, turnComplete, turnStart } from '../src/mod/adapter'
import { appendBounded } from '../src/mod/event-batch'
import { openArgsFor } from '../src/mod/open-args'
import { buildPaneView, roomFor } from '../src/mod/pane-view'
import { graphColumnsFor, panColumn, panToInclude } from '../src/mod/graph-pane'
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
/** Recorded events reach the session atom at most this often, as one write. */
const FLUSH_MS = 250
/** Longest wait between retries of a failed flush. */
const MAX_RETRY_MS = 5000
/** Wrap of the redraw counter; it only has to differ from one second to the next. */
const REDRAW_WRAP = 1000
/** Events kept while flushes fail; the oldest are dropped past this. */
const MAX_QUEUED_EVENTS = 1000
const DEFAULT_PANE_ROWS = 24

/** Agent rows that fit in the pane as last drawn; the focus hook has no viewport, so render leaves it here. */
let latestRoom = roomFor(DEFAULT_PANE_ROWS)

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

/** Tail of the building queue; one queue keeps events in the order the hooks saw them. */
let building: Promise<void> = Promise.resolve()
/** Tail of the flushes; they never overlap. */
let flushing: Promise<void> = Promise.resolve()
/** Recorded events waiting for the next flush. */
let queued: ReadonlyArray<AgentEvent> = []
/** The pending flush timer; at most one, so a burst of events is one write. */
let flushTimer: { cancel: () => void } | undefined
/** Flushes failed in a row; each one doubles the retry delay, up to `MAX_RETRY_MS`. */
let failedFlushes = 0

/** Folds the queued events plus `extra` into the session atom in one write, or writes nothing when nothing changes. */
const flushOnce = async ($: EngineInterface, extra: ReadonlyArray<AgentEvent>): Promise<boolean> => {
  const taken = queued
  queued = []
  const events = [...taken, ...extra]
  if (events.length === 0) return true
  try {
    const at = await $.clock.now()
    const current = await read($, session)
    // The same object back from the reducer means nothing changed, so nothing is written.
    if (current && events.reduce(reduce, current as SessionState) === current) {
      failedFlushes = 0
      return true
    }
    await update($, session, latest => events.reduce(reduce, (latest ?? initialState(FALLBACK_SESSION_ID, at)) as SessionState))
    failedFlushes = 0
    return true
  } catch (err) {
    // A failed flush keeps the recorded events for the next one; poll-only events are rebuilt by the next poll.
    queued = appendBounded(taken, queued, MAX_QUEUED_EVENTS)
    logOnce($, 'flush', err)
    // Retry does not wait for the poll, and backs off while the write keeps failing.
    scheduleFlush($, Math.min(FLUSH_MS * 2 ** failedFlushes, MAX_RETRY_MS))
    failedFlushes += 1
    return false
  }
}

/** Applies the queued events plus `extra`, after any flush already running; resolves false when the write failed. Never throws. */
const flush = ($: EngineInterface, extra: ReadonlyArray<AgentEvent> = []): Promise<boolean> => {
  const result = flushing.then(() => flushOnce($, extra)).catch(() => false)
  flushing = result.then(() => undefined)
  return result
}

/** Arms the flush timer unless one is pending. */
const scheduleFlush = ($: EngineInterface, delay = FLUSH_MS): void => {
  if (flushTimer) return
  try {
    flushTimer = $.clock.after(delay, () => {
      flushTimer = undefined
      void flush($)
    })
  } catch (err) {
    logOnce($, 'schedule', err)
  }
}

/** Builds events (possibly after an engine read) on a clock reading and queues them; never awaits a flush, so the hook path stays free. */
const record = ($: EngineInterface, build: (at: number) => AgentEvent[] | Promise<AgentEvent[]>): void => {
  building = building.then(async () => {
    try {
      const events = await build(await $.clock.now())
      if (events.length === 0) return
      queued = appendBounded(queued, events, MAX_QUEUED_EVENTS)
      scheduleFlush($)
    } catch (err) {
      logOnce($, 'record', err)
    }
  }).catch(() => {})
}

/** Reads the plan's usage once and queues the billing it shows; it runs on session.start and main turn.complete only. */
const recordBilling = ($: EngineInterface, hasCompletedTurn: boolean): void => {
  record($, async at => billingEvent(await $.session.usage(), hasCompletedTurn, at))
}

/**
 * Redraws once a second while the pane is open and an agent has not ended, since elapsed time keeps moving for
 * waiting and unknown agents too. The spinner frame moves only while an agent runs; otherwise `redraw` is bumped.
 */
const advanceSpinner = async ($: EngineInterface): Promise<void> => {
  const [state, current] = await Promise.all([read($, ui), read($, session)])
  if (!state.open) return
  const agents = Object.values(current?.agents ?? {})
  if (!agents.some(agent => agent.endedAt === undefined)) return
  const isRunning = agents.some(agent => agent.status === 'running')
  await update($, ui, latest => (isRunning
    ? { ...latest, spin: (latest.spin + 1) % SPIN_FRAMES }
    : { ...latest, redraw: ((latest.redraw ?? 0) + 1) % REDRAW_WRAP }))
}

export const register: Register = (on, options) => {
  const known: Record<string, string> = {}
  const isAscii = options.ascii === true
  // One poll per mod: a repeated session.start replaces it instead of doubling it.
  let poll: { cancel: () => void } | undefined

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
    recordBilling($, false)
    try {
      // The status line moved to the prompt hint's tail; clear any line an older version pinned.
      $.ui.status(undefined)
    } catch (err) {
      logOnce($, 'session.start status', err)
    }
    try {
      poll?.cancel()
      // A reload must not inherit a flush timer of the old environment.
      flushTimer?.cancel()
      flushTimer = undefined
      poll = $.clock.every(POLL_MS, async () => {
        try {
          const now = await $.clock.now()
          const list = await $.agent.list()
          // `known` moves only after the transitions are stored, so a failed flush cannot lose one.
          if (await flush($, [...listStatus(list, now, known), { kind: 'tick', at: now }])) {
            for (const agent of list) known[agent.id] = agent.status
          }
          await advanceSpinner($)
        } catch (err) {
          logOnce($, 'poll', err)
        }
      })
    } catch (err) {
      logOnce($, 'session.start poll', err)
    }
    try {
      // Immediate: typed while a turn runs, the command must open at once, not queue until the turn ends.
      await $.command.register({ name: 'agentview', description: 'Live view of agents and subagents', immediate: true })
    } catch (err) {
      logOnce($, 'session.start command', err)
    }
    return next(e)
  })

  on('command.run', { command: 'agentview' }, async ($, e) => {
    try {
      // A state saved before the graph existed has no mode. The selection is main, which every graph column
      // layout shows, so the first worker column is 0 and needs no pan.
      await update($, ui, current => ({
        ...current, open: true, view: 'tree', selId: 'main', mode: current.mode ?? 'tree', graphCol: 0, win: undefined,
      }))
      const agentCount = Object.keys((await read($, session))?.agents ?? {}).length
      await $.ui.open({
        id: PANE_ID, title: 'agentview', focus: true, closeOnEscape: true, holdToasts: true,
        ...openArgsFor(e.presentation, agentCount),
      })
    } catch (err) {
      logOnce($, 'command.run', err)
      return { text: 'agentview could not open' }
    }
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
      if (e.requestId === PANE_ID && key && state.view === 'tree' && state.mode !== 'graph' &&
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
    const now = await $.clock.now()
    const columns = e.props.bodyColumns
    const rows = e.viewport?.rows ?? DEFAULT_PANE_ROWS
    const view = buildPaneView({
      session: current, view: state.view, selId: state.selId, mode: state.mode, graphCol: state.graphCol, spin: state.spin,
      now, columns, rows, ascii: isAscii, win: state.win,
    })
    latestRoom = roomFor(e.viewport?.rows ?? DEFAULT_PANE_ROWS, view.isToggleBeside ? 0 : 1)
    const label = (text: string): string => (isAscii ? toPlainAscii(text) : text)
    const step = (offset: number) => async (): Promise<void> => {
      const target = stepId(view.order, state.selId, offset)
      // Not view.hiddenColumns: the detail view draws no graph, so it has none.
      const columns = graphColumnsFor(view.outline, e.props.bodyColumns)
      await update($, ui, latest => ({
        ...latest,
        selId: target,
        graphCol: latest.mode === 'graph' && columns
          ? panToInclude(view.outline, target, latest.graphCol, columns.visible)
          : latest.graphCol,
      }))
    }
    const setMode = (mode: 'tree' | 'graph') => async (): Promise<void> => {
      const columns = graphColumnsFor(view.outline, e.props.bodyColumns)
      // The selection may have moved in the tree while the graph was away; bring its column into view.
      await update($, ui, latest => ({
        ...latest,
        mode,
        graphCol: mode === 'graph' && columns
          ? panToInclude(view.outline, latest.selId, latest.graphCol, columns.visible)
          : latest.graphCol,
      }))
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

  // The status text rides on the prompt hint as its dim tail: engine warnings use `$.ui.status`, which reads as an error.
  // Pure: the text comes from the atom and the clock read in this render, nothing is written.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    try {
      const current = await read($, session)
      if (current) {
        const tail = statusFor(current, await $.clock.now())
        return next({ ...e, props: { ...e.props, tail } })
      }
    } catch (err) {
      logOnce($, 'status', err)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    record($, at => toolStart(e, at))
    // The call is not awaited by the recorder; the end is recorded however it finishes.
    let result: Awaited<ReturnType<typeof next>> | undefined
    try {
      result = await next(e)
      return result
    } finally {
      const finished = result
      record($, at => toolEnd(e, finished ?? { isError: true }, at))
    }
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    record($, at => spawnStart(e, result ?? {}, at))
    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    record($, at => turnStart(e, at))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    record($, at => stepUsage(e, result?.usage ?? null, at))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    record($, at => turnComplete(e, at))
    // Only main's turn says anything about how the session is paid for; a subagent's end does not.
    if (e.agentId === undefined) recordBilling($, true)
    return result
  })
}
