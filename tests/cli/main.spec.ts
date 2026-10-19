import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const repo = path.resolve(import.meta.dirname, '../..')
let root = ''

before(() => {
  execFileSync('npm', ['run', 'build'], { cwd: repo, stdio: 'pipe' })
})
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentview-main-'))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const snapshot = (): string =>
  execFileSync('node', [path.join(repo, 'bin/agentview.js')], {
    env: { ...process.env, AGENTVIEW_PROJECTS_DIR: root, AGENTVIEW_ASCII: '', LC_ALL: 'C.UTF-8' },
    encoding: 'utf8',
  })

test('non-TTY run prints a plain snapshot of one session', () => {
  const dir = path.join(root, '-work-fakeproject')
  fs.mkdirSync(dir)
  const line = {
    type: 'assistant', timestamp: new Date().toISOString(), sessionId: 's1', cwd: '/work/fakeproject',
    message: {
      id: 'm1', model: 'claude-sonnet-5-5', content: [],
      usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }
  fs.writeFileSync(path.join(dir, 's1.jsonl'), `${JSON.stringify(line)}\n`)
  const out = snapshot()
  assert.ok(out.includes('agentview · 1 sessions'), out)
  assert.ok(out.includes('/work/fakepro'), out)
  assert.ok(!out.includes('\x1b'))
})

test('non-TTY run with no sessions says so', () => {
  assert.ok(snapshot().includes('no Claude Code sessions found'))
})
