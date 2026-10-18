import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROGRESS_SUFFIX, withProgressSuffix } from '../../src/mod/spawn-prompt'

test('the suffix is appended to the prompt', () => {
  assert.equal(withProgressSuffix({ prompt: 'do it' }), 'do it' + PROGRESS_SUFFIX)
})

test('the suffix is neutral and names TodoWrite', () => {
  assert.match(PROGRESS_SUFFIX, /^\n\nTrack your steps with the TodoWrite tool/)
})

test('a resumed run keeps its prompt, since the engine ignores a rewrite there', () => {
  assert.equal(withProgressSuffix({ prompt: 'go on', resume: { agentId: 'a1' } }), 'go on')
})

test('a workflow agent keeps its prompt, which may be a placeholder', () => {
  assert.equal(withProgressSuffix({ prompt: 'x', workflow: { runId: 'wf_1', agentIndex: 1 } }), 'x')
})

test('a prompt that already carries the suffix is not doubled', () => {
  const once = withProgressSuffix({ prompt: 'do it' })
  assert.equal(withProgressSuffix({ prompt: once }), once)
})
