import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../../src/core/summary'

test('file tools show a short path', () => {
  assert.equal(summarize('Edit', { file_path: '/home/u/proj/src/auth.ts' }), 'Edit src/auth.ts')
  assert.equal(summarize('Read', { file_path: 'README.md' }), 'Read README.md')
  assert.equal(summarize('Write', { file_path: '/a/b/c/d/e.ts' }), 'Write c/d/e.ts')
})
test('bash shows the first line of the command', () => {
  assert.equal(summarize('Bash', { command: 'npm test\necho hi' }), 'Bash: npm test')
})
test('search tools quote the pattern', () => {
  assert.equal(summarize('Grep', { pattern: 'TODO' }), 'Grep "TODO"')
  assert.equal(summarize('Glob', { pattern: 'src/**/*.ts' }), 'Glob src/**/*.ts')
})
test('agent and task tools show the description', () => {
  assert.equal(summarize('Agent', { description: 'add token refresh' }), 'Task: add token refresh')
  assert.equal(summarize('Task', { description: 'x' }), 'Task: x')
})
test('web and unknown tools', () => {
  assert.equal(summarize('WebFetch', { url: 'https://a.io/x' }), 'WebFetch a.io')
  assert.equal(summarize('mcp__srv__do_thing', {}), 'mcp do_thing')
  assert.equal(summarize('Weird', null), 'Weird')
})
