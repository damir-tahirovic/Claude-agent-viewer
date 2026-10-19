import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createWatcher, nodeFileSystem, type FileSystem } from '../../src/cli/watcher'
import { MAIN } from '../../src/core/model'

const T0 = Date.parse('2026-10-19T10:00:00.000Z')
const iso = (offsetSec: number): string => new Date(T0 + offsetSec * 1000).toISOString()
const NOW = T0 + 10_000

const usage = (input: number) => ({
  input_tokens: input,
  output_tokens: 1,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
})

const assistantLine = (offset: number, messageId: string, input: number, extra: object = {}): string =>
  `${JSON.stringify({
    type: 'assistant',
    timestamp: iso(offset),
    sessionId: 's1',
    cwd: '/work/project',
    message: { id: messageId, model: 'claude-sonnet-5-5', usage: usage(input), content: [] },
    ...extra,
  })}\n`

let root = ''
let bytesRead = 0
const countingFs: FileSystem = {
  ...nodeFileSystem,
  readRange: (file, start, length) => {
    const buffer = nodeFileSystem.readRange(file, start, length)
    bytesRead += buffer.length
    return buffer
  },
}

const projectDir = () => path.join(root, '-work-project')
const mainFile = (sessionId = 's1') => path.join(projectDir(), `${sessionId}.jsonl`)
const append = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, text)
}
const mainTokens = (watcher: ReturnType<typeof createWatcher>): number | undefined =>
  watcher.sessions()[0]?.state.agents[MAIN]?.tokens.input

const writeAgent = (id: string, meta: object, lines = '') => {
  const dir = path.join(projectDir(), 's1', 'subagents')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify(meta))
  fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), lines)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentview-watcher-'))
  bytesRead = 0
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

test('discovers a new session with cwd and title', () => {
  append(mainFile(), assistantLine(0, 'm1', 7) + `${JSON.stringify({ type: 'ai-title', aiTitle: 'Fix bug' })}\n`)
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  assert.equal(watcher.poll(NOW), true)
  const [session] = watcher.sessions()
  assert.equal(session?.sessionId, 's1')
  assert.equal(session?.projectDir, '-work-project')
  assert.equal(session?.cwd, '/work/project')
  assert.equal(session?.title, 'Fix bug')
  assert.equal(session?.startedAt, T0)
})

test('appended lines update tokens', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  append(mainFile(), assistantLine(1, 'm2', 5))
  assert.equal(watcher.poll(NOW + 1000), true)
  assert.equal(mainTokens(watcher), 12)
})

test('a partial line is completed on the next poll', () => {
  const line = assistantLine(0, 'm1', 7)
  append(mainFile(), line.slice(0, 40))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  assert.equal(mainTokens(watcher), 0)
  append(mainFile(), line.slice(40))
  watcher.poll(NOW + 1000)
  assert.equal(mainTokens(watcher), 7)
})

test('a multi-byte character split across reads survives', () => {
  const line = assistantLine(0, 'm1', 7, { note: 'čćž' })
  const bytes = Buffer.from(line)
  const cut = bytes.indexOf(Buffer.from('č')) + 1
  fs.mkdirSync(projectDir(), { recursive: true })
  fs.writeFileSync(mainFile(), bytes.subarray(0, cut))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  fs.appendFileSync(mainFile(), bytes.subarray(cut))
  watcher.poll(NOW + 1000)
  assert.equal(mainTokens(watcher), 7)
})

test('a poll with no file change reads zero bytes and returns false', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  bytesRead = 0
  assert.equal(watcher.poll(NOW), false)
  assert.equal(bytesRead, 0)
})

test('a shrunk file resets that session', () => {
  append(mainFile(), assistantLine(0, 'm1', 7) + assistantLine(1, 'm2', 5))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  fs.writeFileSync(mainFile(), assistantLine(2, 'm9', 3))
  assert.equal(watcher.poll(NOW + 1000), true)
  assert.equal(mainTokens(watcher), 3)
})

test('a subagent appears under main with its parent', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  writeAgent('a1', { agentType: 'Explore', description: 'look around' }, assistantLine(2, 'x1', 4, { agentId: 'a1' }))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  const agent = watcher.sessions()[0]?.state.agents.a1
  assert.equal(agent?.parentId, MAIN)
  assert.equal(agent?.type, 'Explore')
  assert.equal(agent?.startedAt, T0 + 2000)
  assert.equal(agent?.tokens.input, 4)
})

test('a subagent with an empty file starts at the meta mtime', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  writeAgent('a1', { agentType: 'Explore', description: 'x' })
  const metaMtime = fs.statSync(path.join(projectDir(), 's1', 'subagents', 'agent-a1.meta.json')).mtimeMs
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(metaMtime + 1000)
  assert.equal(watcher.sessions()[0]?.state.agents.a1?.startedAt, metaMtime)
})

test('a meta with finished true ends the agent at its last record', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  writeAgent('a1', { agentType: 'Explore', description: 'x', finished: true }, assistantLine(3, 'x1', 4))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  const agent = watcher.sessions()[0]?.state.agents.a1
  assert.equal(agent?.status, 'done')
  assert.equal(agent?.endedAt, T0 + 3000)
})

test('files older than maxAge are ignored', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs, maxAgeMs: 1000 })
  watcher.poll(Date.now() + 60_000)
  assert.equal(watcher.sessions().length, 0)
})

test('only the newest maxSessions files are kept', () => {
  append(mainFile('old'), assistantLine(0, 'm1', 1))
  fs.utimesSync(mainFile('old'), new Date(T0 - 60_000), new Date(T0 - 60_000))
  append(mainFile('new'), assistantLine(0, 'm1', 1))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs, maxSessions: 1 })
  watcher.poll(NOW)
  assert.deepEqual(watcher.sessions().map(session => session.sessionId), ['new'])
})

test('a vanished file does not throw', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(NOW)
  fs.rmSync(mainFile())
  assert.doesNotThrow(() => watcher.poll(NOW + 1000))
})

test('silence past the unknown threshold marks a running subagent unknown on tick', () => {
  append(mainFile(), assistantLine(0, 'm1', 7))
  writeAgent('a1', { agentType: 'Explore', description: 'x' }, assistantLine(1, 'x1', 4))
  const watcher = createWatcher({ projectsDir: root, fs: countingFs })
  watcher.poll(T0 + 2000)
  assert.equal(watcher.sessions()[0]?.state.agents.a1?.status, 'running')
  assert.equal(watcher.poll(T0 + 120_000), true)
  assert.equal(watcher.sessions()[0]?.state.agents.a1?.status, 'unknown')
})
