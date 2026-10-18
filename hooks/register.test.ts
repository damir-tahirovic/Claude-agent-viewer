import { test, expect, mock } from 'claude-code/testing'
import type { AgentviewSession } from '../types'

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
  expect(latest?.agents.main?.toolCount).toBe(1)
})

const AT = 1_700_000_000_000

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the agentview pane lists agents and opens a detail view on ${surface}`, async ($, on) => {
    mock.clock(on, { now: AT })
    on('tool.call', () => ({ result: { type: 'text', file: { filePath: 'a', content: '' } }, text: '' }))
    // Two agents: main (first call) and a subagent (a call carrying its agentId).
    await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
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
  expect(sent.length).toBe(1)
  expect(sent[0]).toMatch(/running .*\/agentview/)
  // The text counts tokens, not calls, so a second identical-looking state sends nothing.
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b' })
  expect(sent.length).toBe(1)
})

test('a broken session atom never breaks the tool call', async ($, on) => {
  mock.clock(on, { now: AT })
  // The plugin's own state is rewritten to null on every write, as if it were corrupted.
  on('state.set', { plugin: 'agentview', key: 'session' }, ($, e, next) => next({ ...e, value: null }))
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
  on('agent.list', () => ({ value: [{ id: 'sub1', type: 'worker', description: 'w', status: 'running' }] }))
  await $.session.start(SESSION_START)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/a' })
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
  on('agent.list', () => ({ value: [{ id: 'sub1', type: 'worker', description: 'w', status: 'running' }] }))
  await $.session.start(SESSION_START)
  await $.tool.call({ tool: 'Read', file_path: '/tmp/b', agentId: 'sub1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'end_turn' })
  const stays = await mountPane($)
  expect(await stays.find({ type: 'Text', text: /✓ done|✓ [1-9]/ })).toBeUndefined()
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
