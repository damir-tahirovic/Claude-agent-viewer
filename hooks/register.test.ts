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
