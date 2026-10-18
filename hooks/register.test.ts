import { test, expect, mock } from 'claude-code/testing'
import type { AgentviewSession, AgentviewUi } from '../types'

test('a Read tool call is counted in the session state', async ($, on) => {
  mock.clock(on)
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

/** Recording is queued behind the tool call, so a test waits for the queue to drain before it looks. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the agentview pane lists agents and opens a detail view on ${surface}`, async ($, on) => {
    mock.clock(on, { now: AT })
    on('tool.call', () => ({ result: { type: 'text', file: { filePath: 'a', content: '' } }, text: '' }))
    // Two agents: main (first call) and a subagent (a call carrying its agentId).
    await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
    await settle()
    await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
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
  mock.clock(on, { now: AT })
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
  mock.clock(on, { now: AT })
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
  const clock = mock.clock(on, { now: AT })
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))
  on('tool.call', readTool)
  on('agent.list', () => ({ value: [] }))
  await $.session.start(SESSION_START)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  const before = await mountPane($)
  expect(await before.find({ type: 'Text', text: /unknown/ })).toBeUndefined()
  await before.unmount()
  await clock.advance(65_000)
  const after = await mountPane($)
  expect(await after.find({ type: 'Text', text: /unknown/ })).toBeDefined()
  await after.unmount()
})

test('after main finishes, running subagents are not faked done; the tick turns them unknown', async ($, on) => {
  const clock = mock.clock(on, { now: AT })
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
    mock.clock(on, { now: AT })
    on('tool.call', readTool)
    await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
    await settle()
    await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
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
  const clock = mock.clock(on, { now: AT })
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
  const clock = mock.clock(on, { now: AT })
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
  mock.clock(on, { now: AT })
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
  mock.clock(on, { now: AT })
  on('tool.call', readTool)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
  await settle()
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
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
  mock.clock(on, { now: AT })
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
  mock.clock(on, { now: AT })
  on('tool.call', readTool)
  for (const id of ['sub1', 'sub2', 'sub3']) await $.tool.call({ tool: 'Read', file_path: '/tmp/' + id, agentId: id })
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
  mock.clock(on, { now: AT })
  on('tool.call', readTool)
  for (const id of ['sub1', 'sub2', 'sub3']) await $.tool.call({ tool: 'Read', file_path: '/tmp/' + id, agentId: id })
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
  mock.clock(on, { now: AT })
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
  mock.clock(on, { now: AT })
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
  mock.clock(on, { now: AT })
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
