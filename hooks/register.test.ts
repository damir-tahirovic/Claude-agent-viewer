import { test, expect, mock } from 'claude-code/testing'
import type { AgentviewSession, AgentviewUi } from '../types'

test('a Read tool call is counted in the session state', async ($, on) => {
  useClock(on)
  let latest: AgentviewSession | undefined
  // The test's own `$` has no state noun, so the plugin's write is observed through state.set.
  on('state.set', { plugin: 'agentview', key: 'session' }, ($, e, next) => {
    if (e.value) latest = e.value
    return next(e)
  })
  on('tool.call', () => ({ result: { type: 'text', file: { filePath: 'a', content: '' } }, text: '' }))
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  expect(latest?.agents.main?.toolCount).toBe(1)
})

const AT = 1_700_000_000_000
/** The recorder flushes at most every 250 ms of the engine's clock. */
const FLUSH_MS = 250

/** The clock of the running test, so `settle` can move it past the recorder's flush delay. */
let activeClock: ReturnType<typeof mock.clock> | undefined

/** Mocks the clock at `AT` and remembers it for `settle`. */
const useClock = (on: Parameters<typeof mock.clock>[0]) => {
  activeClock = mock.clock(on, { now: AT })
  return activeClock
}

/** Recording is queued behind the tool call and flushed in batches, so a test lets the queue drain and the flush fire. */
const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 20))
  await activeClock?.advance(FLUSH_MS)
  await new Promise(resolve => setTimeout(resolve, 20))
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the agentview pane lists agents and opens a detail view on ${surface}`, async ($, on) => {
    useClock(on)
    on('tool.call', () => ({ result: { type: 'text', file: { filePath: 'a', content: '' } }, text: '' }))
    // Two agents: main (first call) and a subagent (a call carrying its agentId).
    await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
    await settle()
    await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
    await settle()
    const pane = await $.ui.mount({
      plugin: 'agentview', surface, component: 'Pane', requestId: 'agentview',
      props: { title: 'agentview', isFocused: true, bodyColumns: 90, placement: 'inline' },
    })
    expect(await pane.find({ type: 'Text', text: /agentview/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /running/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /TASK/ })).toBeUndefined()
    await pane.press({ key: 'sub1' })
    expect(await pane.find({ type: 'Text', text: /TASK/ })).toBeDefined()
    await pane.unmount()
  })
}

const readTool = () => ({ result: { type: 'text', file: { filePath: 'a', content: '' } }, text: '' })
const SESSION_START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

test('the status line is sent after an event and again only when its text changes', async ($, on) => {
  useClock(on)
  const sent: Array<string | undefined> = []
  on('ui.status', ($, e, next) => { sent.push(e.text); return next(e) })
  on('tool.call', readTool)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  expect(sent.length).toBe(1)
  expect(sent[0]).toMatch(/running .*\/agentview/)
  // The text counts tokens, not calls, so a second identical-looking state sends nothing.
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b' })
  await settle()
  expect(sent.length).toBe(1)
})

test('a throwing session atom never breaks the tool call', async ($, on) => {
  useClock(on)
  on('state.get', { plugin: 'agentview', key: 'session' }, () => { throw new Error('corrupt') })
  on('state.set', { plugin: 'agentview', key: 'session' }, () => { throw new Error('corrupt') })
  on('tool.call', () => ({ result: { type: 'text', file: { filePath: 'ok', content: '' } }, text: 'still here' }))
  const result = await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  expect(result.text).toBe('still here')
})

const mountPane = ($: Parameters<Parameters<typeof test>[1]>[0]) => $.ui.mount({
  plugin: 'agentview', surface: 'terminal', component: 'Pane', requestId: 'agentview',
  props: { title: 'agentview', isFocused: true, bodyColumns: 90, placement: 'inline' },
})

test('a subagent silent for more than 60 s shows unknown in the pane', async ($, on) => {
  const clock = useClock(on)
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('tool.call', readTool)
  on('agent.list', () => ({ value: [] }))
  await $.session.start(SESSION_START)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  await settle()
  const before = await mountPane($)
  expect(await before.find({ type: 'Text', text: /unknown/ })).toBeUndefined()
  await before.unmount()
  await clock.advance(65_000)
  const after = await mountPane($)
  expect(await after.find({ type: 'Text', text: /unknown/ })).toBeDefined()
  await after.unmount()
})

test('after main finishes, running subagents are not faked done; the tick turns them unknown', async ($, on) => {
  const clock = useClock(on)
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('tool.call', readTool)
  on('turn.complete', () => ({ text: '' }))
  on('agent.list', () => ({ value: [] }))
  await $.session.start(SESSION_START)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  await settle()
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'end_turn' })
  await settle()
  const stays = await mountPane($)
  // Only main is done between turns; the running subagent is not faked done.
  expect(await stays.find({ type: 'Text', text: /✓ 1 done/ })).toBeDefined()
  expect(await stays.find({ type: 'Text', text: /✓ 2 done/ })).toBeUndefined()
  await stays.unmount()
  await clock.advance(65_000)
  const later = await mountPane($)
  expect(await later.find({ type: 'Text', text: /unknown/ })).toBeDefined()
  await later.unmount()
})

for (const bodyColumns of [50, 59, 60, 79]) {
  test(`the pane renders at ${bodyColumns} columns without throwing`, async ($, on) => {
    useClock(on)
    on('tool.call', readTool)
    await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
    await settle()
    await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
    await settle()
    const pane = await $.ui.mount({
      plugin: 'agentview', surface: 'terminal', component: 'Pane', requestId: 'agentview',
      props: { title: 'agentview', isFocused: true, bodyColumns, placement: 'inline' },
    })
    expect(await pane.find({ type: 'Text', text: /AGENT/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /MODEL/ })).toBeUndefined()
    await pane.unmount()
  })
}

test('the poll still turns a silent subagent unknown when session.id fails', async ($, on) => {
  const clock = useClock(on)
  on('session.id', () => { throw new Error('no id') })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('tool.call', readTool)
  on('agent.list', () => ({ value: [] }))
  await $.session.start(SESSION_START)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  await settle()
  await clock.advance(65_000)
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /unknown/ })).toBeDefined()
  await pane.unmount()
})

test('an agent the engine lists as running is never marked unknown, however silent', async ($, on) => {
  const clock = useClock(on)
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('tool.call', readTool)
  on('agent.list', () => ({ value: [{ id: 'sub1', type: 'worker', description: 'w', status: 'running' }] }))
  await $.session.start(SESSION_START)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  await settle()
  await clock.advance(65_000)
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /unknown/ })).toBeUndefined()
  await pane.unmount()
})

test('a rejected tool still answers and the end is recorded as failed', async ($, on) => {
  useClock(on)
  let latest: AgentviewSession | undefined
  on('state.set', { plugin: 'agentview', key: 'session' }, ($, e, next) => {
    if (e.value) latest = e.value
    return next(e)
  })
  on('tool.call', () => { throw new Error('tool exploded') })
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' }).catch(() => undefined)
  await settle()
  expect(latest?.agents.main?.recent[0]?.ok).toBe(false)
})

const mountGraphPane = ($: Parameters<Parameters<typeof test>[1]>[0], bodyColumns = 160) => $.ui.mount({
  plugin: 'agentview', surface: 'terminal', component: 'Pane', requestId: 'agentview',
  props: { title: 'agentview', isFocused: true, bodyColumns, placement: 'inline' },
})

test('the graph button shows cards, next moves the selection and the tree button returns', async ($, on) => {
  useClock(on)
  on('tool.call', readTool)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  await settle()
  const pane = await mountGraphPane($)
  expect(await pane.find({ type: 'Text', text: /AGENT/ })).toBeDefined()
  await pane.press({ key: 'graph' })
  expect(await pane.find({ type: 'Text', text: /╔═ main/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /AGENT/ })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /p\/n select/ })).toBeDefined()
  await pane.press({ key: '>graph-next<' })
  expect(await pane.find({ type: 'Text', text: /╭─ main/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /╔═ (?!main)/ })).toBeDefined()
  await pane.press({ key: 'tree' })
  expect(await pane.find({ type: 'Text', text: /AGENT/ })).toBeDefined()
  await pane.unmount()
})

test('details opened from the graph show the detail view', async ($, on) => {
  useClock(on)
  on('tool.call', readTool)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  const pane = await mountGraphPane($, 120)
  await pane.press({ key: 'graph' })
  await pane.press({ key: '<graph-details>' })
  expect(await pane.find({ type: 'Text', text: /TASK/ })).toBeDefined()
  await pane.unmount()
})

test('the pan buttons appear only with hidden columns and move the worker range', async ($, on) => {
  useClock(on)
  on('tool.call', readTool)
  for (const id of ['sub1', 'sub2', 'sub3']) await $.tool.call({ tool: 'Read', file_path: '/tmp/' + id, agentId: id })
  await settle()
  const pane = await mountGraphPane($, 110)
  await pane.press({ key: 'graph' })
  expect(await pane.find({ type: 'Text', text: /workers 1–2 of 3/ })).toBeDefined()
  await pane.press({ key: '>pan-right<' })
  expect(await pane.find({ type: 'Text', text: /workers 2–3 of 3/ })).toBeDefined()
  await pane.unmount()
  const wide = await mountGraphPane($, 160)
  expect(await wide.find({ key: '>pan-right<' })).toBeUndefined()
  await wide.unmount()
})

test('next steps pan the graph to the selected worker and the footer hotkeys are real', async ($, on) => {
  useClock(on)
  on('tool.call', readTool)
  for (const id of ['sub1', 'sub2', 'sub3']) await $.tool.call({ tool: 'Read', file_path: '/tmp/' + id, agentId: id })
  await settle()
  const pane = await mountGraphPane($, 110)
  await pane.press({ key: 'graph' })
  expect(await pane.find({ type: 'Text', text: /workers 1–2 of 3/ })).toBeDefined()
  for (let step = 0; step < 3; step++) await pane.press({ key: '>graph-next<' })
  expect(await pane.find({ type: 'Text', text: /workers 2–3 of 3/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /p\/n select {3}d details/ })).toBeDefined()
  await pane.unmount()
})

const UI_STATE = { plugin: 'agentview', key: 'ui' } as const

/** Seeds the ui atom with `seed` (as an older version or the tree would have left it) and follows later writes. */
const seedUi = (on: Parameters<Parameters<typeof test>[1]>[1], seed: unknown): { latest: () => AgentviewUi } => {
  let store = seed as AgentviewUi
  let version = 1
  on('state.get', UI_STATE, () => ({ value: { value: store, version } }))
  on('state.set', UI_STATE, (_$, e) => {
    if (e.value) store = e.value
    version += 1
    return { value: { isSet: true, version } }
  })
  return { latest: () => store }
}

test('a worker selected in the tree stays visible when the graph opens', async ($, on) => {
  useClock(on)
  on('tool.call', readTool)
  for (const id of ['sub1', 'sub2', 'sub3']) await $.tool.call({ tool: 'Read', file_path: '/tmp/' + id, agentId: id })
  await settle()
  const pane = await mountGraphPane($, 110)
  // The kit cannot raise a ui.focus with an element, so the selection moves through the graph's own next
  // Button; panning back and returning to the tree leaves worker 3 selected with the first columns shown.
  await pane.press({ key: 'graph' })
  for (let step = 0; step < 3; step++) await pane.press({ key: '>graph-next<' })
  await pane.press({ key: '<pan-left>' })
  expect(await pane.find({ type: 'Text', text: /workers 1–2 of 3/ })).toBeDefined()
  await pane.press({ key: 'tree' })
  await pane.press({ key: 'graph' })
  expect(await pane.find({ type: 'Text', text: /workers 2–3 of 3/ })).toBeDefined()
  // Panning stays free afterwards: the render never clamps to the selection.
  await pane.press({ key: '<pan-left>' })
  expect(await pane.find({ type: 'Text', text: /workers 1–2 of 3/ })).toBeDefined()
  await pane.unmount()
})

test('stepping in the detail view of a graph pans the graph to the new agent', async ($, on) => {
  useClock(on)
  let graphCol: number | undefined
  on('state.set', UI_STATE, ($, e, next) => {
    graphCol = e.value?.graphCol
    return next(e)
  })
  on('tool.call', readTool)
  for (const id of ['sub1', 'sub2', 'sub3']) await $.tool.call({ tool: 'Read', file_path: '/tmp/' + id, agentId: id })
  await settle()
  const pane = await mountGraphPane($, 110)
  await pane.press({ key: 'graph' })
  await pane.press({ key: '<graph-details>' })
  // main -> sub1 -> sub2 -> sub3 by stepping in the detail view, where the pan Buttons are not drawn.
  for (let step = 0; step < 3; step++) await pane.press({ key: '>next<' })
  expect(graphCol).toBe(1)
  await pane.unmount()
})

test('running the command on a ui state saved without a mode opens the tree', async ($, on) => {
  useClock(on)
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('agent.list', () => ({ value: [] }))
  on('ui.open', () => ({ value: undefined }))
  const ui = seedUi(on, { open: false, view: 'tree', selId: 'main', graphCol: 0, spin: 0 })
  await $.session.start(SESSION_START)
  await $.command.run({ command: 'agentview', args: '' })
  expect(ui.latest().mode).toBe('tree')
})

const SESSION_STATE = { plugin: 'agentview', key: 'session' } as const

/** Counts writes to the agentview atoms and keeps the sessions written, in order. */
const countWrites = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  const writes = { ui: 0, session: 0, sessions: [] as AgentviewSession[] }
  on('state.set', UI_STATE, ($, e, next) => { writes.ui += 1; return next(e) })
  on('state.set', SESSION_STATE, ($, e, next) => {
    writes.session += 1
    if (e.value) writes.sessions.push(e.value)
    return next(e)
  })
  return writes
}

/** Starts the mod with `agents` as the engine's agent list and opens the pane. */
const startAndOpen = async (
  $: Parameters<Parameters<typeof test>[1]>[0],
  on: Parameters<Parameters<typeof test>[1]>[1],
  agents: ReadonlyArray<{ id: string; type: string; description: string; status: string }>,
) => {
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('agent.list', () => ({ value: agents }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  await $.session.start(SESSION_START)
  await $.command.run({ command: 'agentview', args: '' })
  await settle()
}

test('an open pane with no running agent writes nothing in 10 s', async ($, on) => {
  const clock = useClock(on)
  const writes = countWrites(on)
  on('turn.complete', () => ({ text: '' }))
  await startAndOpen($, on, [])
  // Main starts running; finishing its turn leaves nothing running.
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'end_turn' })
  await settle()
  const before = { ui: writes.ui, session: writes.session }
  for (let second = 0; second < 10; second++) await clock.advance(1000)
  expect(writes.ui - before.ui).toBe(0)
  expect(writes.session - before.session).toBe(0)
})

test('an open pane with one running agent writes the ui at most once a second', async ($, on) => {
  const clock = useClock(on)
  const writes = countWrites(on)
  on('tool.call', readTool)
  await startAndOpen($, on, [{ id: 'sub1', type: 'worker', description: 'w', status: 'running' }])
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  await settle()
  const before = { ui: writes.ui, session: writes.session }
  for (let second = 0; second < 10; second++) await clock.advance(1000)
  expect(writes.ui - before.ui).toBeGreaterThan(0)
  expect(writes.ui - before.ui).toBeLessThanOrEqual(10)
  // Heartbeats refresh the signal only every 30 s, so ten seconds write the session at most once.
  expect(writes.session - before.session).toBeLessThanOrEqual(1)
})

test('50 tool calls within 100 ms reach the session in at most 2 writes', async ($, on) => {
  const clock = useClock(on)
  const writes = countWrites(on)
  on('tool.call', readTool)
  await startAndOpen($, on, [])
  const before = writes.session
  for (let call = 0; call < 50; call++) {
    await $.tool.call({ tool: 'Read', file_path: '/tmp/f' + call, agentId: 'sub' + (call % 8) })
    await clock.advance(2)
  }
  await settle()
  expect(writes.session - before).toBeLessThanOrEqual(2)
  const total = Object.values(writes.sessions.at(-1)?.agents ?? {}).reduce((sum, agent) => sum + agent.toolCount, 0)
  expect(total).toBe(50)
})

test('events keep their order across a flush', async ($, on) => {
  const clock = useClock(on)
  const writes = countWrites(on)
  on('tool.call', readTool)
  await startAndOpen($, on, [])
  for (let call = 0; call < 5; call++) {
    await $.tool.call({ tool: 'Read', file_path: '/tmp/f' + call })
    await clock.advance(10)
  }
  await settle()
  const recent = writes.sessions.at(-1)?.agents.main?.recent.map(action => action.summary) ?? []
  expect(recent.length).toBe(5)
  expect(recent.map(summary => Number(/f(\d)/.exec(summary)?.[1]))).toEqual([0, 1, 2, 3, 4])
})

test('a failed flush keeps the events for the next one', async ($, on) => {
  const clock = useClock(on)
  let fail = false
  let latest: AgentviewSession | undefined
  on('state.set', SESSION_STATE, ($, e, next) => {
    if (fail) return { deny: 'write failed' }
    if (e.value) latest = e.value
    return next(e)
  })
  on('tool.call', readTool)
  await startAndOpen($, on, [])
  fail = true
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  expect(latest?.agents.main?.toolCount ?? 0).toBe(0)
  fail = false
  await clock.advance(1000)
  await settle()
  expect(latest?.agents.main?.toolCount).toBe(1)
})

test('the command opens the pane with a size request', async ($, on) => {
  useClock(on)
  let opened: { columns?: number; rows?: number } | undefined
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('agent.list', () => ({ value: [] }))
  on('ui.open', (_$, e) => { opened = e; return { value: undefined } })
  await $.session.start(SESSION_START)
  await $.command.run({ command: 'agentview', args: '' })
  expect(opened?.columns !== undefined || opened?.rows !== undefined).toBe(true)
})

const unknownAbsent = async ($: Parameters<Parameters<typeof test>[1]>[0]): Promise<boolean> => {
  const pane = await mountPane($)
  const found = await pane.find({ type: 'Text', text: /unknown/ })
  await pane.unmount()
  return found === undefined
}

test('a subagent is done in the state within one flush after its turn completes', async ($, on) => {
  const clock = useClock(on)
  const writes = countWrites(on)
  on('tool.call', readTool)
  on('turn.complete', () => ({ text: '' }))
  await startAndOpen($, on, [])
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a', agentId: 'sub1' })
  await settle()
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'end_turn', agentId: 'sub1' })
  await new Promise(resolve => setTimeout(resolve, 20))
  await clock.advance(FLUSH_MS)
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(writes.sessions.at(-1)?.agents.sub1?.status).toBe('done')
})

test('a running subagent the engine lists stays running across 30 s, 59 s and 61 s of silence', async ($, on) => {
  const clock = useClock(on)
  on('tool.call', readTool)
  await startAndOpen($, on, [{ id: 'sub1', type: 'worker', description: 'w', status: 'running' }])
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a', agentId: 'sub1' })
  await settle()
  await clock.advance(30_000)
  expect(await unknownAbsent($)).toBe(true)
  await clock.advance(29_000)
  expect(await unknownAbsent($)).toBe(true)
  await clock.advance(2_000)
  expect(await unknownAbsent($)).toBe(true)
})

test('the elapsed time of a waiting agent keeps redrawing every second', async ($, on) => {
  const clock = useClock(on)
  const writes = countWrites(on)
  on('tool.call', readTool)
  on('turn.complete', () => ({ text: '' }))
  await startAndOpen($, on, [{ id: 'sub1', type: 'worker', description: 'w', status: 'waiting' }])
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a', agentId: 'sub1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'end_turn' })
  await settle()
  await clock.advance(1000)
  const pane = await mountPane($)
  const before = await pane.find({ type: 'Text', text: /waiting.*\d+s/ })
  expect(before).toBeDefined()
  const uiBefore = writes.ui
  const timeBefore = JSON.stringify(before)
  await clock.advance(3000)
  const after = await pane.find({ type: 'Text', text: /waiting.*\d+s/ })
  expect(JSON.stringify(after)).not.toBe(timeBefore)
  expect(writes.ui - uiBefore).toBe(3)
  await pane.unmount()
})

test('the command is registered as immediate so it runs during a turn', async ($, on) => {
  useClock(on)
  let registered: { name?: string; immediate?: true } | undefined
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', (_$, e) => { registered = e; return { value: undefined } })
  on('session.start', () => ({ cwd: '/tmp' }))
  on('agent.list', () => ({ value: [] }))
  await $.session.start(SESSION_START)
  expect(registered?.name).toBe('agentview')
  expect(registered?.immediate).toBe(true)
})
