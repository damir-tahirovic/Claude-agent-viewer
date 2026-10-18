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
