import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialParseState, metaStart, parseLines, parseRecord } from '../../src/cli/transcript'
import { initialState, orderTree, reduce } from '../../src/core/reducer'
import type { AgentEvent } from '../../src/core/model'

const T0 = Date.parse('2026-10-19T10:00:00.000Z')
const iso = (offsetSec: number): string => new Date(T0 + offsetSec * 1000).toISOString()

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }

const assistant = (offset: number, messageId: string, content: unknown[], extra: object = {}) => ({
  type: 'assistant',
  timestamp: iso(offset),
  sessionId: 's1',
  cwd: '/work/project',
  message: { id: messageId, model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage, content },
  ...extra,
})

const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input })

const userResult = (offset: number, toolUseId: string, extra: object = {}, isError?: boolean) => ({
  type: 'user',
  timestamp: iso(offset),
  sessionId: 's1',
  cwd: '/work/project',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseId, ...(isError === undefined ? {} : { is_error: isError }) }],
  },
  ...extra,
})

const parse = (records: unknown[], agentId = 'main'): AgentEvent[] => {
  let state = initialParseState()
  const events: AgentEvent[] = []
  for (const record of records) {
    const result = parseRecord(state, record, agentId)
    state = result.state
    events.push(...result.events)
  }
  return events
}

const ofKind = <K extends AgentEvent['kind']>(events: AgentEvent[], kind: K) =>
  events.filter((event): event is Extract<AgentEvent, { kind: K }> => event.kind === kind)

test('assistant tool_use gives tool.start with the input', () => {
  const events = parse([assistant(1, 'm1', [toolUse('t1', 'Read', { file_path: '/work/a.ts' })])])
  assert.deepEqual(ofKind(events, 'tool.start'), [
    { kind: 'tool.start', at: T0 + 1000, agentId: 'main', toolUseId: 't1', tool: 'Read', input: { file_path: '/work/a.ts' } },
  ])
})

test('assistant record gives usage with the record model', () => {
  const [event] = ofKind(parse([assistant(1, 'm1', [])]), 'usage')
  assert.deepEqual(event.tokens, { input: 10, output: 5, cacheRead: 100, cacheWrite: 20 })
  assert.equal(event.model, 'claude-sonnet-5-5')
})

test('usage is counted once for a message split over several records', () => {
  const events = parse([
    assistant(1, 'm1', [{ type: 'thinking' }]),
    assistant(1, 'm1', [toolUse('t1', 'Read', {})]),
    assistant(2, 'm1', [toolUse('t2', 'Grep', {})]),
  ])
  assert.equal(ofKind(events, 'usage').length, 1)
  assert.equal(ofKind(events, 'tool.start').length, 2)
})

test('every assistant record gives a heartbeat for its agent', () => {
  const events = parse([assistant(1, 'm1', []), assistant(2, 'm1', [])], 'a1')
  assert.equal(ofKind(events, 'heartbeat').length, 2)
  assert.equal(ofKind(events, 'heartbeat')[0].agentId, 'a1')
})

test('tool_result gives tool.end ok', () => {
  const events = parse([userResult(2, 't1')])
  assert.deepEqual(ofKind(events, 'tool.end'), [{ kind: 'tool.end', at: T0 + 2000, agentId: 'main', toolUseId: 't1', ok: true }])
})

test('tool_result with is_error gives ok false', () => {
  assert.equal(ofKind(parse([userResult(2, 't1', {}, true)]), 'tool.end')[0].ok, false)
})

test('a string user prompt starts a main turn', () => {
  const events = parse([{ type: 'user', timestamp: iso(0), message: { role: 'user', content: 'fix the login bug' } }])
  assert.deepEqual(events, [{ kind: 'turn', at: T0, agentId: 'main', phase: 'start' }])
})

test('a subagent prompt does not start a turn', () => {
  const events = parse([{ type: 'user', timestamp: iso(0), message: { role: 'user', content: 'do the task' } }], 'a1')
  assert.deepEqual(events, [])
})

test('isMeta user records do not start a turn', () => {
  const events = parse([{ type: 'user', isMeta: true, timestamp: iso(0), message: { role: 'user', content: 'caveat text' } }])
  assert.deepEqual(events, [])
})

test('system-injected user content starting with < does not start a turn', () => {
  const events = parse([
    { type: 'user', timestamp: iso(0), message: { role: 'user', content: '<task-notification>x</task-notification>' } },
    { type: 'user', timestamp: iso(1), message: { role: 'user', content: '<command-name>/clear</command-name>' } },
  ])
  assert.deepEqual(events, [])
})

test('system turn_duration ends the main turn', () => {
  const events = parse([{ type: 'system', subtype: 'turn_duration', timestamp: iso(9), durationMs: 9000 }])
  assert.deepEqual(events, [{ kind: 'turn', at: T0 + 9000, agentId: 'main', phase: 'end' }])
})

test('other system subtypes are ignored', () => {
  assert.deepEqual(parse([{ type: 'system', subtype: 'compact_boundary', timestamp: iso(9) }]), [])
})

test('Agent result completed gives agent.end ok for that agent', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'Agent', { description: 'explore' })]),
    userResult(5, 't1', { toolUseResult: { status: 'completed', agentId: 'a1' } }),
  ])
  assert.deepEqual(ofKind(events, 'agent.end'), [{ kind: 'agent.end', at: T0 + 5000, id: 'a1', ok: true }])
})

test('Agent result completed with is_error gives agent.end ok false', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'Agent', {})]),
    userResult(5, 't1', { toolUseResult: { status: 'completed', agentId: 'a1' } }, true),
  ])
  assert.equal(ofKind(events, 'agent.end')[0].ok, false)
})

test('Agent result async_launched does not end the agent', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'Agent', {})]),
    userResult(2, 't1', { toolUseResult: { status: 'async_launched', agentId: 'a1' } }),
  ])
  assert.equal(ofKind(events, 'agent.end').length, 0)
  assert.equal(ofKind(events, 'tool.end').length, 1)
})

const notification = (id: string, status: string) => ({
  type: 'queue-operation',
  operation: 'enqueue',
  timestamp: iso(8),
  content: `<task-notification><task-id>${id}</task-id><status>${status}</status></task-notification>`,
})

test('task-notification completed gives agent.end ok', () => {
  assert.deepEqual(parse([notification('a2', 'completed')]), [{ kind: 'agent.end', at: T0 + 8000, id: 'a2', ok: true }])
})

test('task-notification failed gives agent.end ok false', () => {
  assert.equal(ofKind(parse([notification('a2', 'failed')]), 'agent.end')[0].ok, false)
})

test('task-notification killed gives agent.end ok false', () => {
  assert.equal(ofKind(parse([notification('a2', 'killed')]), 'agent.end')[0].ok, false)
})

test('queue-operation without a task-notification is ignored', () => {
  assert.deepEqual(parse([{ type: 'queue-operation', operation: 'enqueue', timestamp: iso(1), content: 'hello' }]), [])
})

test('TodoWrite gives a todos event', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'TodoWrite', { todos: [{ content: 'step one', status: 'in_progress' }, { content: 'step two' }] })]),
  ])
  assert.deepEqual(ofKind(events, 'todos')[0].todos, [
    { content: 'step one', status: 'in_progress' },
    { content: 'step two', status: 'pending' },
  ])
})

test('TaskCreate result gives task.add with the engine id and the subject', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'TaskCreate', { subject: 'write tests' })]),
    userResult(2, 't1', { toolUseResult: { task: { id: '7' } } }),
  ])
  assert.deepEqual(ofKind(events, 'task.add'), [{ kind: 'task.add', at: T0 + 2000, agentId: 'main', id: '7', content: 'write tests' }])
})

test('TaskCreate that failed gives no task.add', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'TaskCreate', { subject: 'write tests' })]),
    userResult(2, 't1', { toolUseResult: { task: { id: '7' } } }, true),
  ])
  assert.equal(ofKind(events, 'task.add').length, 0)
})

test('TaskUpdate result gives task.set', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'TaskUpdate', { taskId: '7', status: 'completed' })]),
    userResult(2, 't1', { toolUseResult: { success: true } }),
  ])
  assert.deepEqual(ofKind(events, 'task.set'), [{ kind: 'task.set', at: T0 + 2000, id: '7', status: 'completed' }])
})

test('TaskUpdate with an unknown status gives no task.set', () => {
  const events = parse([
    assistant(1, 'm1', [toolUse('t1', 'TaskUpdate', { taskId: '7', status: 'bogus' })]),
    userResult(2, 't1', {}),
  ])
  assert.equal(ofKind(events, 'task.set').length, 0)
})

test('a record without a valid timestamp yields no events', () => {
  const record = { ...assistant(1, 'm1', [toolUse('t1', 'Read', {})]), timestamp: 'not a date' }
  assert.deepEqual(parse([record]), [])
  assert.deepEqual(parse([{ type: 'assistant', message: {} }]), [])
})

test('unknown record types and non-object records are skipped', () => {
  assert.deepEqual(parse([{ type: 'summary', timestamp: iso(1) }, null, 42, 'text', []]), [])
})

test('parseRecord does not mutate the input state', () => {
  const state = initialParseState()
  parseRecord(state, assistant(1, 'm1', [toolUse('t1', 'Read', {})]), 'main')
  assert.equal(state.lastMessageId, undefined)
  assert.deepEqual(state.toolNames, {})
})

test('metaStart gives agent.start with the parent from the meta', () => {
  const event = metaStart(
    { agentType: 'worker', description: 'fix login', parentAgentId: 'a1', model: 'claude-haiku-4-5', toolUseId: 'tu' },
    'a2',
    T0,
  )
  assert.deepEqual(event, {
    kind: 'agent.start', at: T0, id: 'a2', parentId: 'a1', type: 'worker', description: 'fix login', model: 'claude-haiku-4-5',
  })
})

test('metaStart defaults the parent to main', () => {
  const event = metaStart({ agentType: 'Explore', description: 'look' }, 'a2', T0)
  assert.equal(event?.kind === 'agent.start' && event.parentId, 'main')
})

test('metaStart returns null for a meta that is not an object', () => {
  assert.equal(metaStart(null, 'a2', T0), null)
  assert.equal(metaStart('x', 'a2', T0), null)
})

test('parseLines skips blank and invalid JSON lines', () => {
  const good = JSON.stringify(assistant(1, 'm1', [toolUse('t1', 'Read', {})]))
  const result = parseLines(initialParseState(), `\n{broken\n${good}\n   \n`, 'main')
  assert.equal(ofKind(result.events, 'tool.start').length, 1)
})

test('parseLines carries state across lines so usage is counted once', () => {
  const line = JSON.stringify(assistant(1, 'm1', []))
  const result = parseLines(initialParseState(), `${line}\n${line}\n`, 'main')
  assert.equal(ofKind(result.events, 'usage').length, 1)
})

test('a fixture reduces to main plus one subagent with tokens summed once per message id', () => {
  const mainEvents = parse([
    { type: 'user', timestamp: iso(0), message: { role: 'user', content: 'review the code' } },
    assistant(1, 'm1', [{ type: 'text', text: 'ok' }]),
    assistant(1, 'm1', [toolUse('t1', 'Agent', { description: 'explore', subagent_type: 'Explore' })]),
    userResult(2, 't1', { toolUseResult: { status: 'async_launched', agentId: 'a1' } }),
    assistant(3, 'm2', [toolUse('t2', 'Read', { file_path: '/work/a.ts' })]),
    userResult(4, 't2'),
    notification('a1', 'completed'),
    { type: 'system', subtype: 'turn_duration', timestamp: iso(10) },
  ])
  const subEvents = parse([
    assistant(5, 's1', [toolUse('u1', 'Grep', { pattern: 'x' })]),
    userResult(6, 'u1'),
  ], 'a1')
  const start = metaStart({ agentType: 'Explore', description: 'explore' }, 'a1', T0 + 2000)
  assert.ok(start)
  const events = [start, ...mainEvents, ...subEvents].sort((a, b) => a.at - b.at)
  const state = events.reduce(reduce, initialState('s1', T0))
  assert.deepEqual(orderTree(state).map(entry => entry.id), ['main', 'a1'])
  assert.equal(state.agents.a1.parentId, 'main')
  assert.equal(state.agents.a1.type, 'Explore')
  assert.equal(state.agents.a1.status, 'done')
  assert.equal(state.agents.main.status, 'done')
  assert.equal(state.agents.main.tokens.input, 20)
  assert.equal(state.agents.main.tokens.output, 10)
  assert.equal(state.agents.a1.tokens.input, 10)
  assert.equal(state.agents.a1.toolCount, 1)
})

test('parsing 5000 records where every tool is Read leaves toolNames empty', () => {
  let state = initialParseState()
  for (let index = 0; index < 5000; index += 1) {
    state = parseRecord(state, assistant(index, `m${index}`, [toolUse(`t${index}`, 'Read', {})]), 'main').state
    state = parseRecord(state, userResult(index, `t${index}`), 'main').state
  }
  assert.deepEqual(state.toolNames, {})
  assert.deepEqual(state.taskInputs, {})
})

test('a tracked tool is forgotten once its result arrives', () => {
  let state = initialParseState()
  state = parseRecord(state, assistant(1, 'm1', [toolUse('t1', 'TaskCreate', { subject: 'x' })]), 'main').state
  assert.deepEqual(Object.keys(state.toolNames), ['t1'])
  state = parseRecord(state, userResult(2, 't1', { toolUseResult: { task: { id: '1' } } }), 'main').state
  assert.deepEqual(state.toolNames, {})
  assert.deepEqual(state.taskInputs, {})
})

test('a user content list with a text block starts a main turn', () => {
  const content = [{ type: 'text', text: 'what is in this picture' }, { type: 'image', source: {} }]
  const events = parse([{ type: 'user', timestamp: iso(0), message: { role: 'user', content } }])
  assert.deepEqual(events, [{ kind: 'turn', at: T0, agentId: 'main', phase: 'start' }])
})

test('a content list prompt that is meta or system-injected does not start a turn', () => {
  const list = (text: string) => [{ type: 'text', text }]
  assert.deepEqual(parse([{ type: 'user', isMeta: true, timestamp: iso(0), message: { content: list('hi') } }]), [])
  assert.deepEqual(parse([{ type: 'user', timestamp: iso(0), message: { content: list('<command-name>x') } }]), [])
})

const streamed = (offset: number, messageId: string, stopReason: string | null, output: number) => ({
  type: 'assistant',
  timestamp: iso(offset),
  message: {
    id: messageId,
    model: 'claude-sonnet-5-5',
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 },
    content: [],
  },
})

const userPrompt = (offset: number) => ({
  type: 'user',
  timestamp: iso(offset),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x' }] },
})

test('a final record wins over earlier snapshots of the same message id', () => {
  const events = parse([streamed(1, 'm1', null, 16), streamed(2, 'm1', 'tool_use', 900), streamed(3, 'm2', null, 3)])
  const usages = ofKind(events, 'usage')
  assert.equal(usages.length, 1)
  assert.equal(usages[0].tokens.output, 900)
  assert.equal(usages[0].isOutputKnown, undefined)
})

test('a message without a final record gives zero output and isOutputKnown false once the next message starts', () => {
  const events = parse([streamed(1, 'm1', null, 16), streamed(2, 'm1', null, 20), streamed(3, 'm2', null, 5)])
  const usages = ofKind(events, 'usage')
  assert.equal(usages.length, 1)
  assert.deepEqual(usages[0].tokens, { input: 10, output: 0, cacheRead: 100, cacheWrite: 20 })
  assert.equal(usages[0].isOutputKnown, false)
})

test('a user record ends a message that has no final record', () => {
  const events = parse([streamed(1, 'm1', null, 16), userPrompt(2)])
  const usages = ofKind(events, 'usage')
  assert.equal(usages.length, 1)
  assert.equal(usages[0].isOutputKnown, false)
})

test('a system record ends a message that has no final record', () => {
  const events = parse([streamed(1, 'm1', null, 16), { type: 'system', timestamp: iso(2), subtype: 'x' }])
  assert.equal(ofKind(events, 'usage').length, 1)
})

test('usage events come before the events of the record that ended the message', () => {
  const events = parse([streamed(1, 'm1', null, 16), streamed(2, 'm2', 'end_turn', 7)])
  const kinds = events.map(event => event.kind)
  assert.deepEqual(kinds, ['heartbeat', 'usage', 'usage', 'heartbeat'])
  assert.equal(ofKind(events, 'usage')[0].isOutputKnown, false)
})

test('a message pending at the end of the text stays pending until the next parseLines call', () => {
  const first = parseLines(initialParseState(), JSON.stringify(streamed(1, 'm1', null, 16)) + '\n', 'a1')
  assert.equal(ofKind(first.events, 'usage').length, 0)
  const second = parseLines(first.state, JSON.stringify(streamed(2, 'm1', 'end_turn', 400)) + '\n', 'a1')
  const usages = ofKind(second.events, 'usage')
  assert.equal(usages.length, 1)
  assert.equal(usages[0].tokens.output, 400)
  const third = parseLines(second.state, JSON.stringify(streamed(3, 'm2', null, 1)) + '\n', 'a1')
  assert.equal(ofKind(third.events, 'usage').length, 0)
})

test('records of an already finished message id give no second usage', () => {
  const events = parse([streamed(1, 'm1', 'end_turn', 50), streamed(2, 'm1', 'end_turn', 50)])
  assert.equal(ofKind(events, 'usage').length, 1)
})
