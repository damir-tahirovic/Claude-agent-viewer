# agentview Phase 1 (in-session dialog + status line) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code mod that adds `/agentview`, a live, Esc-closable dialog that shows the session's agent tree (status, current action, tokens, cost, plan %), plus an always-on status line entry.

**Architecture:** Plugin events are translated into our own `AgentEvent`s. A pure reducer folds them into a `SessionState`. `buildView` turns the state into the spec's row model, and pure renderers turn rows into lines in the spec's `{codes|text}` format. These are the same lines as the golden fixtures, so tests compare strings exactly. The mod then maps those lines to `<Text>` elements. Phase 2 (CLI) reuses everything below `src/mod/` and only adds an ANSI adapter.

**Tech Stack:** TypeScript, Claude Code mod API (Claude Code 2.1.302, `claude-code` module), Node 20.19 + `tsx` + `node:test` for core tests, and `claude plugin test` for mod tests.

**Spec:** `../../../../AGENTVIEW.md` (sections 3.1–3.7), `docs/design/tui-spec.txt`, `docs/design/golden/tui/*.spec.txt`, `src/view/spec-golden.ts`, and the spec's own reference generator `docs/design/spec-generator.js`. The view code ports that generator.

## Global Constraints

- **`agentview/CLAUDE.md` overrides the code snippets in this plan.** The snippets show behavior; adapt them to the standards. In particular:
  - add `readonly` to the domain types;
  - no `any`: use the engine types or narrow local types;
  - give the spec helpers descriptive names (`C`→`colorize`, `D`→`dim`, `vl`→`visibleLength`, `padR`→`padRight`, `padL`→`padLeft`, `fit`→`fitText`, `strip`→`stripCodes`, `ascii`→`toAscii`) and use those names consistently in later tasks;
  - write exhaustive switches with a `never` check.

- UI text is English, exactly as in the spec (`running`, `waiting`, `done`, `failed`, `unknown`).
- Colors: only the 8 basic ANSI colors + dim + bold + inverse. Never gray. Codes used in lines: `d` dim, `B` bold, `c` cyan, `y` yellow, `g` green, `r` red, `b` blue, `I` inverse. Codes combine (`yB`, `rB`, `IB`).
- Width tiers: tier 1 below 100 columns, tier 2 for 100–139, tier 3 from 140.
- Plan % only from the main agent's todo list. Without a list show `—`. Never invent a number.
- Cost always prefixed `~`. TOK = input + output. Cache tokens appear only in the detail view.
- Expensive: cost ≥ $0.50 or ≥ 40% of the session cost. Stuck: the same action for > 3 min. Unknown: no signal for > 60 s.
- Rows are ordered depth-first, children in start order. Rows never re-sort. Selection follows agent `id`, not the row index.
- Hooks never block Claude: record the event, call `next(e)`, catch every error.
- `src/core/` and `src/view/` import nothing from Node or from `claude-code`. Pure TS only.
- Core test files are `*.spec.ts` (node runner). Mod test files are `*.test.ts` (`claude plugin test`). Never mix them.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
agentview/
  package.json               scripts: test, typecheck
  tsconfig.json              strict, noEmit, includes src tests hooks
  LICENSE                    MIT
  README.md
  .claude-plugin/plugin.json
  hooks/hooks.json           { "modules": ["./register.tsx"] }
  hooks/register.tsx         wiring only: events → adapter → atom; command; pane; status; tick
  hooks/register.test.ts     mod tests (claude plugin test)
  types/index.d.ts           PluginState contract for the atom
  src/core/model.ts          types: AgentNode, SessionState, AgentEvent, Tokens, Todo
  src/core/reducer.ts        initialState(), reduce(state, event)
  src/core/summary.ts        summarize(tool, input) → "Edit src/auth.ts"
  src/core/format.ts         fmtK, fmtT, fmtCost, shortModel
  src/core/cost.ts           PRICES, costOf(model, tokens)
  src/core/progress.ts       planOf(todos) → { done, total, cur } | null
  src/view/lines.ts          C, D, strip, vl, padR, padL, fit, ascii (spec helpers)
  src/view/rows.ts           Row type, buildRows(state, now) → Row[]
  src/view/dialog.ts         renderDialog(opts) → string[]
  src/view/detail.ts         renderDetail(opts) → string[]
  src/view/status.ts         statusLine(rows, plan) → string
  src/view/spec-golden.ts    (exists, generated; do not edit)
  src/mod/adapter.ts         toolCallEvents / spawnEvent / stepUsage: plugin event → AgentEvent[]
  src/mod/paint.tsx          lineToText(line, Text) → JSX (codes → Text props)
  tests/core/*.spec.ts
  tests/view/*.spec.ts
  tests/fixtures/spec-rows.ts  Row[] copied from the generator's base()
```

---

### Task 1: Spike — verify mod API facts the later tasks rely on

Throwaway code. It goes in the dev-mods folder, not in `agentview/`. The output is findings in `AGENTVIEW.md` §6.

**Files:**
- Create (throwaway): `~/.claude/dev-mods/<session-id>/agentview-spike/` with `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/lib.ts`
- Modify: `AGENTVIEW.md` §6 (findings), §4 (check 1.1)

**Interfaces:**
- Produces: written answers to Q1–Q6 below. Tasks 10–12 follow them.

- [ ] **Step 1: Load the plugin-authoring skill** (`Skill plugin-authoring`) to get the dev-mods path and the types file path. Grep the types file for each declaration named below.

- [ ] **Step 2: Write the spike module**

```tsx
// hooks/lib.ts
export const tag = (s: string) => `[spike] ${s}`
```

```tsx
// hooks/register.tsx
import type { Register } from 'claude-code'
import { tag } from './lib'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'spike', description: 'agentview spike pane' })
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    $.ui.log(tag(`tool.call ${e.tool} agent=${e.agentId ?? 'main'} keys=${Object.keys(e).join(',')}`))
    const r = await next(e)
    $.ui.log(tag(`tool.done ${e.tool} isError=${'isError' in r ? r.isError : '-'}`))
    return r
  })
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    $.ui.log(tag(`spawn type=${e.subagentType} parent=${e.parentAgentId ?? 'main'} -> ${JSON.stringify(r)}`))
    return r
  })
  on('turn.step', async ($, e, next) => {
    const r = await next(e)
    $.ui.log(tag(`step agent=${e.agentId ?? 'main'} model=${e.model} usage=${JSON.stringify(r.usage)}`))
    return r
  })
  on('command.run', { command: 'spike' }, async $ => {
    await $.ui.open({ id: 'spike', title: 'spike', focus: true, closeOnEscape: true, holdToasts: true })
    return { text: 'spike opened' }
  })
  on('ui.render', { component: 'Pane', requestId: 'spike' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await $.agent.list()
    return (
      <Box flexDirection="column">
        <Text>cols={String(e.props.bodyColumns)} agents={String(list.length)}</Text>
        <Text color="cyan" weight="bold" inverse>inverse bold cyan</Text>
        <Text dimColor>dim text</Text>
        <Button key="row-a" plain label="row A" onPress={() => $.ui.log(tag('pressed A'))} />
        <Button key="row-b" plain label="row B" onPress={() => $.ui.log(tag('pressed B'))} />
      </Box>
    )
  })
  on('ui.focus', async ($, e, next) => { $.ui.log(tag(`focus ${JSON.stringify(e)}`)); return next(e) })
  on('ui.close', async ($, e, next) => { $.ui.log(tag(`close ${JSON.stringify(e)}`)); return next(e) })
}
```

If `Button` takes no `onPress`, grep `ButtonProps` and `'ui.press'` in the types file and use what it documents. Run `claude plugin validate <spike folder>` until it is clean.

- [ ] **Step 3: Run it.** Accept hot reload. Then, in this session, run an `Agent` call (subagent_type `Explore`, any small search), run `/spike`, and press ↑↓, Enter, then Esc.

- [ ] **Step 4: Record the answers in `AGENTVIEW.md` §6**, one bullet each:
  - Q1: Does the relative import `./lib` work? Does `../../src/x` (outside `hooks/`) work? If not, the fallback is to keep core under `hooks/core/` and `hooks/view/`, with `src/` symlinked or moved.
  - Q2: `tool.call` fields: is `agentId` present inside subagents? How does an error show on the result?
  - Q3: `agent.spawn`: does `next` return `{ agentId, model }`? When does a subagent end: does the Agent `tool.call` resolve at the end? Does `$.agent.list()` `status` reach `completed`/`failed`?
  - Q4: `turn.step` `usage` shape (field names for input/output/cache), `model`, and `agentId` inside subagents.
  - Q5: Pane: does the engine draw its own border/title (then we render with `frame: false`)? What is `bodyColumns`? Do `inverse`/`weight`/`color` work on `Text`?
  - Q6: Keys: do ↑↓ walk `plain` Buttons and fire `ui.focus` with the button `key`? Does Enter press it? Does Esc fire `ui.close` that a hook can refuse (return without `next`) to go "back" instead of closing?

- [ ] **Step 5: Delete the spike folder.** Mark 1.1 done in `AGENTVIEW.md` with a one-line note.

---

### Task 2: Project skeleton and toolchain

**Files:**
- Create: `agentview/package.json`, `agentview/tsconfig.json`, `agentview/LICENSE`, `agentview/.gitignore`, `agentview/.claude-plugin/plugin.json`, `agentview/hooks/hooks.json`, `agentview/tests/core/smoke.spec.ts`

**Interfaces:**
- Produces: `npm test` runs `tests/**/*.spec.ts`. `npm run typecheck` runs `tsc --noEmit`.

- [ ] **Step 1: Write the files**

`package.json`:
```json
{
  "name": "agentview",
  "version": "0.1.0",
  "description": "Live terminal view of Claude Code agents and subagents: tree, tokens, cost, progress",
  "license": "MIT",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --import tsx --test \"tests/**/*.spec.ts\"",
    "typecheck": "tsc --noEmit -p ."
  },
  "devDependencies": { "tsx": "^4.19.0", "typescript": "^5.6.0", "@types/node": "^20.0.0" }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "jsx": "preserve", "skipLibCheck": true,
    "allowImportingTsExtensions": false, "types": ["node"]
  },
  "include": ["src", "tests"]
}
```
(`hooks/` is type-checked separately with the engine's generated tsconfig, as the plugin-authoring skill describes.)

`.claude-plugin/plugin.json`:
```json
{ "name": "agentview", "version": "0.1.0", "description": "Live terminal view of agents and subagents: tree, tokens, cost, progress", "types": "./types/index.d.ts" }
```

`hooks/hooks.json`:
```json
{ "modules": ["./register.tsx"] }
```

`.gitignore`:
```
node_modules/
.claude-plugin/types/
*.log
```

`LICENSE`: standard MIT text, `Copyright (c) 2026 Damir Tahirovic`.

`tests/core/smoke.spec.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GOLDEN } from '../../src/view/spec-golden'

test('golden fixtures load', () => {
  assert.ok(GOLDEN['1a'].length > 10)
})
```

- [ ] **Step 2: Install and run**

Run: `cd agentview && npm install && npm test && npm run typecheck`
Expected: 1 test passes; typecheck reports no errors.

- [ ] **Step 3: Commit** (`hooks/register.tsx` comes in Task 10; the plugin does not load yet, which is fine)

```bash
git add -A && git commit -m "chore: project skeleton, toolchain, plugin manifest"
```

---

### Task 3: Core model and reducer

**Files:**
- Create: `src/core/model.ts`, `src/core/reducer.ts`
- Test: `tests/core/reducer.spec.ts`

**Interfaces:**
- Consumes: `summarize(tool, input)` from Task 4. Write Task 4 first, or stub it to return `tool` and replace it in Task 4.
- Produces: `initialState(sessionId: string, at: number): SessionState` and `reduce(s: SessionState, e: AgentEvent): SessionState`. Tree order is `orderTree(s): string[]` (DFS, children by `startedAt`). All types are as below.

- [ ] **Step 1: Write `src/core/model.ts`**

```ts
export type AgentStatus = 'running' | 'waiting' | 'done' | 'failed' | 'unknown'
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type Action = { tool: string; summary: string; at: number; ok: boolean | null; ms?: number }
export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }

export type AgentNode = {
  id: string
  parentId?: string
  type: string
  description: string
  model?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  lastSignal: number
  current?: { toolUseId: string; tool: string; summary: string; since: number }
  recent: Action[]
  toolCount: number
  tokens: Tokens
}

export type SessionState = {
  sessionId: string
  startedAt: number
  agents: Record<string, AgentNode>
  todos: Record<string, Todo[]>
}

export type AgentEvent =
  | { kind: 'agent.start'; at: number; id: string; parentId?: string; type: string; description: string; model?: string }
  | { kind: 'agent.end'; at: number; id: string; ok: boolean }
  | { kind: 'tool.start'; at: number; agentId: string; toolUseId: string; tool: string; input: unknown }
  | { kind: 'tool.end'; at: number; agentId: string; toolUseId: string; ok: boolean }
  | { kind: 'usage'; at: number; agentId: string; model?: string; tokens: Tokens }
  | { kind: 'todos'; at: number; agentId: string; todos: Todo[] }
  | { kind: 'waiting'; at: number; agentId: string }
  | { kind: 'tick'; at: number }

export const MAIN = 'main'
export const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
export const RECENT_MAX = 20
export const UNKNOWN_AFTER_MS = 60_000
```

- [ ] **Step 2: Write the failing tests `tests/core/reducer.spec.ts`**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, reduce, orderTree } from '../../src/core/reducer'
import type { AgentEvent } from '../../src/core/model'

const run = (evs: AgentEvent[]) => evs.reduce(reduce, initialState('s1', 0))

test('main agent exists from the start', () => {
  const s = initialState('s1', 5)
  assert.equal(s.agents.main.status, 'running')
  assert.equal(s.agents.main.type, 'main')
})

test('subagent start, tool, end', () => {
  const s = run([
    { kind: 'agent.start', at: 10, id: 'a1', type: 'worker', description: 'fix login', model: 'claude-sonnet-5-5' },
    { kind: 'tool.start', at: 11, agentId: 'a1', toolUseId: 't1', tool: 'Edit', input: { file_path: '/x/src/a.ts' } },
  ])
  assert.equal(s.agents.a1.parentId, 'main')
  assert.equal(s.agents.a1.current?.tool, 'Edit')
  assert.equal(s.agents.a1.toolCount, 1)
  const s2 = [
    { kind: 'tool.end', at: 12, agentId: 'a1', toolUseId: 't1', ok: false } as AgentEvent,
    { kind: 'agent.end', at: 13, id: 'a1', ok: true } as AgentEvent,
  ].reduce(reduce, s)
  assert.equal(s2.agents.a1.current, undefined)
  assert.equal(s2.agents.a1.recent[0].ok, false)
  assert.equal(s2.agents.a1.recent[0].ms, 1)
  assert.equal(s2.agents.a1.status, 'done')
  assert.equal(s2.agents.a1.endedAt, 13)
})

test('usage accumulates per agent; model kept', () => {
  const t = { input: 100, output: 10, cacheRead: 5, cacheWrite: 1 }
  const s = run([
    { kind: 'usage', at: 1, agentId: 'main', model: 'claude-opus-5-5', tokens: t },
    { kind: 'usage', at: 2, agentId: 'main', tokens: t },
  ])
  assert.deepEqual(s.agents.main.tokens, { input: 200, output: 20, cacheRead: 10, cacheWrite: 2 })
  assert.equal(s.agents.main.model, 'claude-opus-5-5')
})

test('events for an unseen agent create it under main', () => {
  const s = run([{ kind: 'tool.start', at: 1, agentId: 'ghost', toolUseId: 't', tool: 'Read', input: {} }])
  assert.equal(s.agents.ghost.parentId, 'main')
  assert.equal(s.agents.ghost.type, 'agent')
})

test('waiting, then the next tool.start returns to running', () => {
  const s = run([
    { kind: 'waiting', at: 1, agentId: 'main' },
  ])
  assert.equal(s.agents.main.status, 'waiting')
  const s2 = reduce(s, { kind: 'tool.start', at: 2, agentId: 'main', toolUseId: 't', tool: 'Bash', input: { command: 'ls' } })
  assert.equal(s2.agents.main.status, 'running')
})

test('tick marks silent running subagents unknown after 60s, never main', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a1', type: 'worker', description: '' },
    { kind: 'tick', at: 60_001 },
  ])
  assert.equal(s.agents.a1.status, 'unknown')
  assert.equal(s.agents.main.status, 'running')
})

test('a signal revives an unknown agent', () => {
  const s = run([
    { kind: 'agent.start', at: 0, id: 'a1', type: 'worker', description: '' },
    { kind: 'tick', at: 70_000 },
    { kind: 'usage', at: 70_001, agentId: 'a1', tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
  ])
  assert.equal(s.agents.a1.status, 'running')
})

test('recent keeps the last 20 actions', () => {
  let s = initialState('s', 0)
  for (let i = 0; i < 25; i++) {
    s = reduce(s, { kind: 'tool.start', at: i, agentId: 'main', toolUseId: 't' + i, tool: 'Read', input: {} })
    s = reduce(s, { kind: 'tool.end', at: i, agentId: 'main', toolUseId: 't' + i, ok: true })
  }
  assert.equal(s.agents.main.recent.length, 20)
  assert.equal(s.agents.main.toolCount, 25)
})

test('todos stored per agent', () => {
  const s = run([{ kind: 'todos', at: 1, agentId: 'main', todos: [{ content: 'a', status: 'completed' }] }])
  assert.equal(s.todos.main.length, 1)
})

test('orderTree is DFS with children by start time', () => {
  const s = run([
    { kind: 'agent.start', at: 1, id: 'w1', type: 'worker', description: '' },
    { kind: 'agent.start', at: 2, id: 'w2', type: 'worker', description: '' },
    { kind: 'agent.start', at: 3, id: 's1', parentId: 'w1', type: 'scout', description: '' },
  ])
  assert.deepEqual(orderTree(s), ['main', 'w1', 's1', 'w2'])
})

test('reduce never mutates the input state', () => {
  const s = initialState('s', 0)
  const frozen = JSON.stringify(s)
  reduce(s, { kind: 'agent.start', at: 1, id: 'a', type: 'x', description: '' })
  assert.equal(JSON.stringify(s), frozen)
})
```

- [ ] **Step 3: Run it.** `npm test`. Expected: FAIL, module `reducer` not found.

- [ ] **Step 4: Write `src/core/reducer.ts`**

```ts
import { MAIN, RECENT_MAX, UNKNOWN_AFTER_MS, ZERO, type AgentEvent, type AgentNode, type SessionState } from './model'
import { summarize } from './summary'

const node = (id: string, at: number, x: Partial<AgentNode> = {}): AgentNode => ({
  id, type: 'agent', description: '', status: 'running', startedAt: at, lastSignal: at,
  recent: [], toolCount: 0, tokens: { ...ZERO }, parentId: id === MAIN ? undefined : MAIN, ...x,
})

export const initialState = (sessionId: string, at: number): SessionState => ({
  sessionId, startedAt: at, agents: { [MAIN]: node(MAIN, at, { type: 'main' }) }, todos: {},
})

const alive = (a: AgentNode, at: number): AgentNode =>
  ({ ...a, lastSignal: at, status: a.status === 'unknown' || a.status === 'waiting' ? 'running' : a.status })

const withAgent = (s: SessionState, id: string, at: number, f: (a: AgentNode) => AgentNode): SessionState => {
  const a = s.agents[id] ?? node(id, at)
  return { ...s, agents: { ...s.agents, [id]: f(a) } }
}

export const reduce = (s: SessionState, e: AgentEvent): SessionState => {
  switch (e.kind) {
    case 'agent.start':
      return withAgent(s, e.id, e.at, a => ({
        ...a, type: e.type, description: e.description, model: e.model ?? a.model,
        parentId: e.parentId ?? MAIN, status: 'running', startedAt: e.at, lastSignal: e.at,
      }))
    case 'agent.end':
      return withAgent(s, e.id, e.at, a => ({ ...a, status: e.ok ? 'done' : 'failed', endedAt: e.at, current: undefined, lastSignal: e.at }))
    case 'tool.start':
      return withAgent(s, e.agentId, e.at, a => ({
        ...alive(a, e.at), status: 'running', toolCount: a.toolCount + 1,
        current: { toolUseId: e.toolUseId, tool: e.tool, summary: summarize(e.tool, e.input), since: e.at },
      }))
    case 'tool.end':
      return withAgent(s, e.agentId, e.at, a => {
        const c = a.current?.toolUseId === e.toolUseId ? a.current : undefined
        const act = { tool: c?.tool ?? '?', summary: c?.summary ?? '', at: c?.since ?? e.at, ok: e.ok, ms: c ? e.at - c.since : undefined }
        return { ...alive(a, e.at), current: c ? undefined : a.current, recent: [...a.recent, act].slice(-RECENT_MAX) }
      })
    case 'usage':
      return withAgent(s, e.agentId, e.at, a => ({
        ...alive(a, e.at), model: e.model ?? a.model,
        tokens: {
          input: a.tokens.input + e.tokens.input, output: a.tokens.output + e.tokens.output,
          cacheRead: a.tokens.cacheRead + e.tokens.cacheRead, cacheWrite: a.tokens.cacheWrite + e.tokens.cacheWrite,
        },
      }))
    case 'todos':
      return { ...s, todos: { ...s.todos, [e.agentId]: e.todos } }
    case 'waiting':
      return withAgent(s, e.agentId, e.at, a => ({ ...a, status: 'waiting', lastSignal: e.at }))
    case 'tick': {
      let changed = false
      const agents: Record<string, AgentNode> = {}
      for (const [id, a] of Object.entries(s.agents)) {
        const stale = id !== MAIN && a.status === 'running' && e.at - a.lastSignal > UNKNOWN_AFTER_MS
        agents[id] = stale ? { ...a, status: 'unknown' } : a
        changed ||= stale
      }
      return changed ? { ...s, agents } : s
    }
  }
}

export const orderTree = (s: SessionState): string[] => {
  const kids: Record<string, string[]> = {}
  for (const a of Object.values(s.agents)) if (a.parentId) (kids[a.parentId] ??= []).push(a.id)
  for (const k of Object.values(kids)) k.sort((x, y) => s.agents[x].startedAt - s.agents[y].startedAt)
  const out: string[] = []
  const walk = (id: string) => { out.push(id); (kids[id] ?? []).forEach(walk) }
  walk(MAIN)
  return out
}
```

- [ ] **Step 5: Run it.** `npm test`. Expected: all reducer tests PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(core): event model and pure reducer"`

---

### Task 4: Action summaries

**Files:**
- Create: `src/core/summary.ts`
- Test: `tests/core/summary.spec.ts`

**Interfaces:**
- Produces: `summarize(tool: string, input: unknown): string` and `relPath(p: string): string`. The spec's NOW column uses the shapes `Edit src/auth.ts`, `Bash: npm test`, `Grep "TODO"`, `Task: add token refresh`.

- [ ] **Step 1: Failing tests**

```ts
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
```

- [ ] **Step 2: Run it.** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**

```ts
const str = (o: unknown, k: string): string | undefined => {
  const v = o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined
  return typeof v === 'string' ? v : undefined
}

/** Last 3 path segments at most: '/home/u/proj/src/auth.ts' → 'src/auth.ts' when inside a project dir. */
export const relPath = (p: string): string => {
  const parts = p.split('/').filter(Boolean)
  const src = parts.lastIndexOf('src')
  if (src >= 0) return parts.slice(src).join('/')
  return parts.slice(-3).join('/')
}

export const summarize = (tool: string, input: unknown): string => {
  const file = str(input, 'file_path') ?? str(input, 'notebook_path')
  if (file && ['Read', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) return `${tool} ${relPath(file)}`
  if (tool === 'Bash') return `Bash: ${(str(input, 'command') ?? '').split('\n')[0]}`
  if (tool === 'Grep') return `Grep "${str(input, 'pattern') ?? ''}"`
  if (tool === 'Glob') return `Glob ${str(input, 'pattern') ?? ''}`
  if (tool === 'Agent' || tool === 'Task') return `Task: ${str(input, 'description') ?? ''}`
  if (tool === 'WebFetch') { try { return `WebFetch ${new URL(str(input, 'url') ?? '').host}` } catch { return 'WebFetch' } }
  if (tool === 'WebSearch') return `WebSearch "${str(input, 'query') ?? ''}"`
  if (tool.startsWith('mcp__')) return `mcp ${tool.split('__').slice(2).join('__')}`
  return tool
}
```

`relPath('/a/b/c/d/e.ts')` gives `c/d/e.ts` (no `src`, last 3 segments), which matches the test.

- [ ] **Step 4: Run it.** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(core): action summaries"` (after `git add`)

---

### Task 5: Formatting, cost, plan progress

**Files:**
- Create: `src/core/format.ts`, `src/core/cost.ts`, `src/core/progress.ts`
- Test: `tests/core/format.spec.ts`, `tests/core/cost.spec.ts`, `tests/core/progress.spec.ts`

**Interfaces:**
- Produces:
  - `fmtK(n: number): string`, `fmtT(secs: number): string`, `fmtCost(usd: number): string` (gives `~$0.61`), `shortModel(id?: string): string` (gives `sonnet-5-5`)
  - `PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>` (USD per million tokens, keyed by short model), `costOf(model: string | undefined, t: Tokens): number`
  - `planOf(todos: Todo[] | undefined): { done: number; total: number; cur: string } | null`

- [ ] **Step 1: Get current prices.** Invoke the `claude-api` skill and read its pricing reference for opus-5-5, sonnet-5-5, haiku-5-5 and fable-5-1 (input, output, cache read, cache write per MTok). Do not use remembered prices. Put the numbers in `PRICES` with a comment naming the date read.

- [ ] **Step 2: Failing tests.** `fmtK` and `fmtT` must match the generator exactly (`docs/design/spec-generator.js` lines 37–38).

```ts
// tests/core/format.spec.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtK, fmtT, fmtCost, shortModel } from '../../src/core/format'

test('fmtK', () => {
  assert.equal(fmtK(600), '600'); assert.equal(fmtK(3700), '3.7k')
  assert.equal(fmtK(21500), '21.5k'); assert.equal(fmtK(123456), '123k')
})
test('fmtT', () => {
  assert.equal(fmtT(22), '22s'); assert.equal(fmtT(188), '3m08s'); assert.equal(fmtT(3725), '1h02m')
})
test('fmtCost', () => { assert.equal(fmtCost(0.614), '~$0.61'); assert.equal(fmtCost(0), '~$0.00') })
test('shortModel', () => {
  assert.equal(shortModel('claude-sonnet-5-5'), 'sonnet-5-5')
  assert.equal(shortModel('claude-opus-5-5[1m]'), 'opus-5-5')
  assert.equal(shortModel(undefined), '—')
})
```

```ts
// tests/core/cost.spec.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costOf, PRICES } from '../../src/core/cost'

test('cost uses per-MTok prices for every bucket', () => {
  const p = PRICES['sonnet-5-5']
  const c = costOf('claude-sonnet-5-5', { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 })
  assert.equal(c, p.input + p.output + p.cacheRead + p.cacheWrite)
})
test('unknown model costs 0', () => {
  assert.equal(costOf('mystery', { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }), 0)
})
```

```ts
// tests/core/progress.spec.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planOf } from '../../src/core/progress'

test('no list → null (shown as —)', () => { assert.equal(planOf(undefined), null); assert.equal(planOf([]), null) })
test('done/total and current item', () => {
  assert.deepEqual(planOf([
    { content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' },
  ]), { done: 1, total: 3, cur: 'b' })
})
test('no in_progress → first pending; all done → last item', () => {
  assert.equal(planOf([{ content: 'a', status: 'completed' }, { content: 'b', status: 'pending' }])?.cur, 'b')
  assert.equal(planOf([{ content: 'a', status: 'completed' }])?.cur, 'a')
})
```

- [ ] **Step 3: Run it.** `npm test`. Expected: FAIL.
- [ ] **Step 4: Implement**

```ts
// src/core/format.ts
export const fmtK = (n: number) => n < 1000 ? String(n) : n < 100000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n / 1000) + 'k'
export const fmtT = (s: number) => s < 60 ? s + 's' : s < 3600
  ? Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's'
  : Math.floor(s / 3600) + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm'
export const fmtCost = (usd: number) => '~$' + usd.toFixed(2)
export const shortModel = (id?: string) => id ? id.replace(/^claude-/, '').replace(/\[.*\]$/, '') : '—'
```

This matches the generator's `$ = n => '~$' + n.toFixed(2)` (`docs/design/spec-generator.js` line 39).

```ts
// src/core/cost.ts
import type { Tokens } from './model'
import { shortModel } from './format'

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }
/** USD per million tokens. Source: claude-api skill pricing reference, read <DATE>. */
export const PRICES: Record<string, Price> = {
  // filled in Step 1, e.g. 'sonnet-5-5': { input: …, output: …, cacheRead: …, cacheWrite: … }
}
export const costOf = (model: string | undefined, t: Tokens): number => {
  const p = PRICES[shortModel(model)]
  if (!p) return 0
  return (t.input * p.input + t.output * p.output + t.cacheRead * p.cacheRead + t.cacheWrite * p.cacheWrite) / 1e6
}
```

```ts
// src/core/progress.ts
import type { Todo } from './model'
export type Plan = { done: number; total: number; cur: string }
export const planOf = (todos: Todo[] | undefined): Plan | null => {
  if (!todos?.length) return null
  const done = todos.filter(t => t.status === 'completed').length
  const cur = todos.find(t => t.status === 'in_progress') ?? todos.find(t => t.status === 'pending') ?? todos[todos.length - 1]
  return { done, total: todos.length, cur: cur.content }
}
```

- [ ] **Step 5: Run it.** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(core): formatting, cost, plan progress"`

---

### Task 6: Row model (state → spec rows)

**Files:**
- Create: `src/view/rows.ts`, `tests/fixtures/spec-rows.ts`
- Test: `tests/view/rows.spec.ts`

**Interfaces:**
- Consumes: `orderTree`, `SessionState`, `costOf`, `shortModel`, `MAIN`.
- Produces:
```ts
export type RowStatus = 'running' | 'waiting' | 'done' | 'failed' | 'unknown'
export type Row = {
  id: string; d: number; name: string; task: string; model: string; st: RowStatus; act: string
  i: number; o: number; cr: number; cw: number; calls: number; secs: number; cost: number; stuck?: 1
}
export const buildRows: (s: SessionState, now: number) => Row[]
```
The field names are the generator's agent record `A(...)` plus `id`, so the dialog port reads them unchanged.

- [ ] **Step 1: Write `tests/fixtures/spec-rows.ts`.** Copy `base()` from `docs/design/spec-generator.js` lines 43–51 verbatim into `Row` objects, adding `id: 'r0'…'r6'`:

```ts
import type { Row } from '../../src/view/rows'
const A = (id: string, d: number, name: string, task: string, model: string, st: Row['st'], act: string,
  i: number, o: number, cr: number, cw: number, calls: number, secs: number, cost: number, x: Partial<Row> = {}): Row =>
  ({ id, d, name, task, model, st, act, i, o, cr, cw, calls, secs, cost, ...x })
export const specRows = (): Row[] => [
  A('r0', 0, 'main', 'refactor auth flow', 'opus-5-5', 'running', 'Task: add token refresh', 18400, 3100, 52000, 9000, 14, 372, 0.61),
  A('r1', 1, 'worker', 'fix login bug', 'sonnet-5-5', 'done', 'Edit src/login.ts', 9800, 2200, 31000, 4200, 31, 188, 0.14),
  A('r2', 2, 'scout', 'find session usages', 'haiku-5-5', 'done', 'Grep "session"', 3100, 600, 8000, 900, 9, 22, 0.01),
  A('r3', 1, 'worker', 'add token refresh', 'sonnet-5-5', 'running', 'Edit src/auth.ts', 7400, 1900, 31200, 4100, 24, 201, 0.12),
  A('r4', 2, 'Explore', 'map refresh callers', 'haiku-5-5', 'running', 'Grep "TODO"', 2300, 410, 5000, 700, 6, 34, 0.01),
  A('r5', 2, 'reviewer', 'review auth diff', 'sonnet-5-5', 'waiting', 'Bash: rm -rf dist', 4000, 700, 9000, 1200, 4, 95, 0.03),
  A('r6', 1, 'worker', 'write auth tests', 'sonnet-5-5', 'running', 'Bash: npm test', 11200, 2400, 40000, 5200, 23, 250, 0.18, { stuck: 1 }),
]
```

- [ ] **Step 2: Failing tests `tests/view/rows.spec.ts`**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, reduce } from '../../src/core/reducer'
import { buildRows } from '../../src/view/rows'
import type { AgentEvent } from '../../src/core/model'

const evs: AgentEvent[] = [
  { kind: 'usage', at: 0, agentId: 'main', model: 'claude-opus-5-5', tokens: { input: 100, output: 20, cacheRead: 7, cacheWrite: 3 } },
  { kind: 'agent.start', at: 1000, id: 'w', type: 'worker', description: 'fix login bug', model: 'claude-sonnet-5-5' },
  { kind: 'tool.start', at: 2000, agentId: 'w', toolUseId: 't', tool: 'Edit', input: { file_path: '/p/src/login.ts' } },
]
const s = evs.reduce(reduce, initialState('s', 0))

test('maps nodes to spec rows in tree order with depth', () => {
  const rows = buildRows(s, 5000)
  assert.deepEqual(rows.map(r => [r.name, r.d]), [['main', 0], ['worker', 1]])
  const w = rows[1]
  assert.equal(w.task, 'fix login bug'); assert.equal(w.model, 'sonnet-5-5')
  assert.equal(w.act, 'Edit src/login.ts'); assert.equal(w.secs, 4); assert.equal(w.calls, 1)
  assert.equal(rows[0].i, 100); assert.equal(rows[0].o, 20); assert.equal(rows[0].cr, 7); assert.equal(rows[0].cw, 3)
})

test('main task is the first user-facing description or empty', () => {
  assert.equal(buildRows(s, 5000)[0].task, '')
})

test('stuck when the same action runs > 3 min', () => {
  assert.equal(buildRows(s, 2000 + 180_001)[1].stuck, 1)
  assert.equal(buildRows(s, 2000 + 179_000)[1].stuck, undefined)
})

test('finished agent shows its last action and frozen time', () => {
  const s2 = [
    { kind: 'tool.end', at: 3000, agentId: 'w', toolUseId: 't', ok: true } as AgentEvent,
    { kind: 'agent.end', at: 4000, id: 'w', ok: true } as AgentEvent,
  ].reduce(reduce, s)
  const w = buildRows(s2, 99_000)[1]
  assert.equal(w.st, 'done'); assert.equal(w.act, 'Edit src/login.ts'); assert.equal(w.secs, 3)
})
```

- [ ] **Step 3: Run it.** `npm test`. Expected: FAIL.
- [ ] **Step 4: Implement `src/view/rows.ts`**

```ts
import { orderTree } from '../core/reducer'
import { costOf } from '../core/cost'
import { shortModel } from '../core/format'
import type { SessionState } from '../core/model'

export type RowStatus = 'running' | 'waiting' | 'done' | 'failed' | 'unknown'
export type Row = {
  id: string; d: number; name: string; task: string; model: string; st: RowStatus; act: string
  i: number; o: number; cr: number; cw: number; calls: number; secs: number; cost: number; stuck?: 1
}
export const STUCK_AFTER_MS = 180_000

export const buildRows = (s: SessionState, now: number): Row[] => {
  const depth = (id: string): number => { const p = s.agents[id].parentId; return p && s.agents[p] ? 1 + depth(p) : 0 }
  return orderTree(s).map(id => {
    const a = s.agents[id]
    const last = a.recent[a.recent.length - 1]
    const end = a.endedAt ?? now
    const stuck = a.status === 'running' && a.current && now - a.current.since > STUCK_AFTER_MS ? 1 as const : undefined
    return {
      id, d: depth(id), name: a.type, task: a.description, model: shortModel(a.model), st: a.status,
      act: a.current?.summary ?? last?.summary ?? '',
      i: a.tokens.input, o: a.tokens.output, cr: a.tokens.cacheRead, cw: a.tokens.cacheWrite,
      calls: a.toolCount, secs: Math.max(0, Math.round((end - a.startedAt) / 1000)), cost: costOf(a.model, a.tokens),
      ...(stuck ? { stuck } : {}),
    }
  })
}
```

- [ ] **Step 5: Run it.** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(view): row model from session state"`

---

### Task 7: Dialog renderer (port of the spec generator) with golden tests

**Files:**
- Create: `src/view/lines.ts`, `src/view/dialog.ts`
- Test: `tests/view/dialog.spec.ts`

**Interfaces:**
- Consumes: `Row` (Task 6), `fmtK`, `fmtT`, `fmtCost` (Task 5), `Plan` (Task 5).
- Produces:
```ts
// lines.ts
export const C: (codes: string, text: string) => string
export const D: (text: string) => string
export const strip: (s: string) => string
export const vl: (s: string) => number
export const padR: (s: string, w: number) => string
export const padL: (s: string, w: number) => string
export const fit: (t: string, w: number) => string
export const ascii: (s: string) => string
export const SPIN: string[]   // ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
// dialog.ts
export type DialogOpts = {
  W: number; agents: Row[]; sel?: number; sid?: string; path?: string; plan?: Plan | null
  win?: [number, number]; after?: string[]; minRows?: number; ended?: string; hints?: [string, string][]
  ascii?: boolean; frame?: boolean; spin?: string
}
export const renderDialog: (o: DialogOpts) => string[]
export const windowFor: (n: number, sel: number, rows: number, prev?: [number, number]) => [number, number]
```

- [ ] **Step 1: Read the reference.** Read `docs/design/spec-generator.js` lines 1–129 and the per-screen calls further down (grep `dialog({`). Note each screen's options (`win`, `sel`, `after`, `plan`, `ended`, `minRows`, `path`, `hints`). The test fixtures below need them.

- [ ] **Step 2: Failing golden tests `tests/view/dialog.spec.ts`.** The dialog frame is the lines from the first `╭`/`+-` line to the last `╰`/`+` bottom line of each golden (the golden also includes chat context around it).

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GOLDEN } from '../../src/view/spec-golden'
import { renderDialog } from '../../src/view/dialog'
import { strip } from '../../src/view/lines'
import { specRows } from '../fixtures/spec-rows'

// First line whose plain text starts with ╭ or "+-", through the first later line
// whose plain text starts with ╰ (or, in ASCII, the last line that starts with "+-").
const frameOf = (id: string) => {
  const P = GOLDEN[id].map(strip)
  const a = P.findIndex(l => l.startsWith('╭') || l.startsWith('+-'))
  let b = P.findIndex((l, i) => i > a && l.startsWith('╰'))
  if (b < 0) b = P.map((l, i) => (i > a && l.startsWith('+-') ? i : -1)).reduce((m, i) => Math.max(m, i), -1)
  return GOLDEN[id].slice(a, b + 1)
}
const plan = { done: 6, total: 10, cur: 'Add token refresh to auth.ts' }

test('1a · 120 cols', () => assert.deepEqual(renderDialog({ W: 120, agents: specRows(), sel: 3, plan }), frameOf('1a')))
test('1b · 160 cols', () => assert.deepEqual(renderDialog({ W: 160, agents: specRows(), sel: 3, plan }), frameOf('1b')))
test('3a · 80 cols', () => assert.deepEqual(renderDialog({ W: 80, agents: specRows(), sel: 3, plan }), frameOf('3a')))
test('3b · ascii', () => assert.deepEqual(renderDialog({ W: 80, agents: specRows(), sel: 3, plan, ascii: true }), frameOf('3b')))
// 7a–7e: build options exactly as the generator's screen definitions do (Step 1), one test each.
```

For 7a–7e, write one test each. Copy that screen's agent list and options from the generator's screen definition into the test literally (e.g. 7a: a single `main` row with act `Read docs/auth.md`, i+o = 2.5k, cost 0.04, `plan: null`, `after: [<the "no subagents yet" line>]`). Write out the full literal `Row` objects; do not refer to the generator at runtime.

Before writing the 7x tests, check that `frameOf` picks the right lines: print `frameOf('1a').map(strip)` and `frameOf('3b').map(strip)` once and compare them with `docs/design/golden/tui/1a.spec.txt` and `3b.spec.txt`.

- [ ] **Step 3: Run it.** `npm test`. Expected: FAIL (no module).

- [ ] **Step 4: Port.** Write `src/view/lines.ts` from generator lines 10–16 and 40 (`strip`, `vl`, `C`, `D`, `padR`, `padL`, `fit`, `ascii`). Use the patched `C` from `docs/design/render-spec.js`: `const C = (c, t) => t ? (c ? `{${c}|${t}}` : t) : ''`. Write `src/view/dialog.ts` as a typed port of generator lines 52–129 (`totals`, `pre`, `top`, `bottom`, `rule`, `txt`, `bar`, `hints`, `stCell`, `dialog`). Apply the header-row patch from `render-spec.js` (the `hb` replacement: the header row is `D('│') + D('  ' + heads) + ' ' + D('│')`). Rules for the port:
  - Keep the arithmetic and string building byte-for-byte; only add types.
  - Replace the generator's `$()` with `fmtCost`, and its `fmtK`/`fmtT` with the Task 5 versions.
  - Add `spin` (current spinner frame, default `'⠋'`) and use it wherever the generator uses `SP` for running rows and the running count.
  - Add `frame` (default `true`). When `false`, drop the top and bottom border lines and render each `txt`/row line without the leading `│` and trailing `│`/`┃`, so the mod can draw inside the engine's own pane frame if Task 1 Q5 says the engine draws one. Column math still uses `W` (pass `bodyColumns + 2` from the mod in that case).
  - `windowFor(n, sel, rows, prev)`: return `[0, n]` when `n <= rows`. Otherwise keep `prev` if `sel` is inside it, else shift the window by the minimum needed to contain `sel` (scrolls one row at a time, spec 7b).

- [ ] **Step 5: Run it.** `npm test`. Expected: all golden tests PASS. When one fails, diff `strip()`ed lines first (layout), then raw lines (codes).
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(view): dialog renderer matching UI spec goldens"`

---

### Task 8: Detail view renderer

**Files:**
- Create: `src/view/detail.ts`
- Test: `tests/view/detail.spec.ts`

**Interfaces:**
- Consumes: `lines.ts` helpers, `AgentNode`, `Todo`, `fmtK`, `fmtT`, `shortModel`.
- Produces:
```ts
export type DetailOpts = {
  W: number; agent: AgentNode; parentName: string; todos?: Todo[]; now: number
  clock: (ms: number) => string        // 'HH:MM:SS'; injected so tests are deterministic
  spin?: string; ascii?: boolean; frame?: boolean
}
export const renderDetail: (o: DetailOpts) => string[]
```

- [ ] **Step 1: Read the reference.** Read generator lines 130–end of the `detail` function (grep `const detail`). Note the layout constants: `W = 120`, `Lw = 66`, and the right column width `W - 2 - Lw - 1`. Note the action format and the token bars relative to the largest bucket.

- [ ] **Step 2: Failing golden test.** Build the spec agent as an `AgentNode`: id `r3`, type `worker`, description = the TASK text from golden 2, model `claude-sonnet-5-5`, parent `main`. Set started so that `clock(startedAt)` is `14:02:11` and elapsed is 3m21s. Add the generator's 20 actions (`acts` array, line 140) as `recent` entries with `at = start + off*1000`, `ok` and `ms` from the strings (`'0.1s'` → 100). The last action is `current`, not in `recent`, if the generator draws it with a spinner (`ok === null`). Set `toolCount` 24, the tokens from the generator, and the todos from the generator's detail TODO block. `clock` maps ms to `HH:MM:SS` of `14:02:11 + offset`. Assert that `renderDetail(...)` equals the frame lines of `GOLDEN['2']`, using the same `frameOf` helper as Task 7. Move `frameOf` into `tests/view/frame.ts` and import it from both test files.

- [ ] **Step 3: Run it.** Expected: FAIL. **Step 4:** Port the generator's `detail` function, parameterized by `DetailOpts` instead of `base()[3]`. Keep the arithmetic and strings byte-for-byte. Same `frame`/`spin`/`ascii` rules as Task 7. **Step 5:** Run it. Expected: PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(view): agent detail view"`

---

### Task 9: Status line (variant C, attention first)

**Files:**
- Create: `src/view/status.ts`
- Test: `tests/view/status.spec.ts`

**Interfaces:**
- Consumes: `Row`, `Plan`, `fmtK`, `fmtT`, `fmtCost`.
- Produces: `statusLine(rows: Row[], plan: Plan | null, now?: { waitingWhy?: Record<string, string>; failedWhy?: Record<string, string> }): string` (plain text; `$.ui.status` takes text).

Priority order (spec screen 4, variant C):
1. Any `waiting`: `◔ <name> waiting for permission · <act> · /agentview`
2. Any running row with `stuck`: `! <task> on "<act without 'Bash: '>" for <fmtT(secs)> · /agentview`
3. Any `failed`: `✗ <task> failed · <failedWhy[id] ?? 'error'> · /agentview`
4. All non-main rows done and main idle/done, with plan total = done: `✓ all <n> agents done · <tok> tok · <cost> · 100%`
5. Otherwise: `⠋ <running> running · <tok> tok · <pct>   /agentview` (pct = `—` without a plan; tok = sum i+o via `fmtK`)

- [ ] **Step 1: Failing tests.** The expected strings are copied from `docs/design/golden/tui/4.spec.txt` section C:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLine } from '../../src/view/status'
import { specRows } from '../fixtures/spec-rows'

const plan = { done: 6, total: 10, cur: 'x' }
test('waiting wins', () => {
  assert.equal(statusLine(specRows(), plan), '◔ reviewer waiting for permission · Bash: rm -rf dist · /agentview')
})
test('stuck next', () => {
  const r = specRows().map(x => x.st === 'waiting' ? { ...x, st: 'running' as const } : x)
  assert.equal(statusLine(r, plan), '! write auth tests on "npm test" for 4m10s · /agentview')
})
test('failed next', () => {
  const r = specRows().map(x => ({ ...x, stuck: undefined, st: x.st === 'waiting' ? 'running' as const : x.st }))
  r[6] = { ...r[6], st: 'failed' }
  assert.equal(statusLine(r, plan, { failedWhy: { r6: 'exit 1' } }), '✗ write auth tests failed · exit 1 · /agentview')
})
test('counts fallback', () => {
  const r = specRows().map(x => ({ ...x, stuck: undefined, st: x.st === 'waiting' ? 'done' as const : x.st }))
  assert.equal(statusLine(r, plan), '⠋ 4 running · 67.5k tok · 60%   /agentview')
})
test('no plan shows —', () => {
  assert.match(statusLine([{ ...specRows()[0] }], null), /· —   \/agentview$/)
})
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement** following the priority list above. Use `fmtK(sum(i+o))` and `Math.round(done/total*100) + '%'`. **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(view): attention-first status line"`

---

### Task 10: Mod wiring — events into state

Follow the Task 1 findings (Q1–Q4). Where they contradict the code below, the findings win. Note the change in the task's commit message.

**Files:**
- Create: `src/mod/adapter.ts`, `types/index.d.ts`, `hooks/register.tsx`, `hooks/register.test.ts`
- Test: `tests/mod/adapter.spec.ts` (pure part), `hooks/register.test.ts` (engine part)

**Interfaces:**
- Consumes: `reduce`, `initialState`, `AgentEvent`, `MAIN`.
- Produces:
```ts
// src/mod/adapter.ts — pure, no 'claude-code' import; takes plain objects
export const toolStart: (e: { tool: string; tool_use_id?: string; agentId?: string; [k: string]: unknown }, at: number) => AgentEvent[]
export const toolEnd: (e: { tool: string; tool_use_id?: string; agentId?: string }, r: { isError?: boolean; deny?: string }, at: number) => AgentEvent[]
export const spawnStart: (e: { subagentType: string; description?: string; parentAgentId?: string }, r: { agentId?: string; model?: string }, at: number) => AgentEvent[]
export const stepUsage: (e: { agentId?: string; model: string }, usage: Record<string, unknown> | null, at: number) => AgentEvent[]
export const listStatus: (list: { id: string; status: string }[], at: number, known: Record<string, string>) => AgentEvent[]
```
- The atom is `atom({ plugin: 'agentview', key: 'session' } as const, null as SessionState | null)`, declared in `types/index.d.ts` as `interface PluginState { agentview: { session: SessionState | null; ui: UiState } }`, with `UiState = { open: boolean; view: 'tree' | 'detail'; selId: string; win?: [number, number]; spin: number }`.

Rules (the pure adapter):
- `toolStart`: always emits `tool.start` with `agentId ?? MAIN`. Also, if `tool` is `TodoWrite`, emits `todos` from `e.todos`. If `tool` is `Agent`/`Task`, emits nothing extra (`agent.spawn` covers it).
- `toolEnd`: emits `tool.end` with `ok = !r.isError && !r.deny`. If `tool` is `Agent`/`Task` and the result names an `agentId`, also emits `agent.end` for it (foreground subagent finished).
- `spawnStart`: emits `agent.start` with `id = r.agentId` (none → `[]`), `type = subagentType`, `description`, `parentId = parentAgentId ?? MAIN`, `model = r.model`.
- `stepUsage`: maps the usage field names found in Task 1 Q4 (expected `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) to `Tokens`. Model = `usage.model ?? e.model`. Emits nothing when `usage` is null.
- `listStatus`: for each agent whose `$.agent.list()` status moved to `completed` → `agent.end ok:true`; `failed`/`killed` → `agent.end ok:false`; `waiting` → `waiting`. `known` holds the last status seen per id; the caller updates it.

- [ ] **Step 1: Failing pure tests `tests/mod/adapter.spec.ts`**, one per rule above. Example:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolStart, toolEnd, spawnStart, stepUsage, listStatus } from '../../src/mod/adapter'

test('tool start in main and in a subagent', () => {
  assert.deepEqual(toolStart({ tool: 'Read', tool_use_id: 't', file_path: 'a' }, 1)[0],
    { kind: 'tool.start', at: 1, agentId: 'main', toolUseId: 't', tool: 'Read', input: { tool: 'Read', tool_use_id: 't', file_path: 'a' } })
  assert.equal(toolStart({ tool: 'Read', tool_use_id: 't', agentId: 'a1' }, 1)[0].kind, 'tool.start')
})
test('TodoWrite also emits todos', () => {
  const ev = toolStart({ tool: 'TodoWrite', tool_use_id: 't', todos: [{ content: 'x', status: 'pending' }] }, 1)
  assert.deepEqual(ev.map(e => e.kind), ['tool.start', 'todos'])
})
test('errors and denies are not ok', () => {
  assert.equal((toolEnd({ tool: 'Bash', tool_use_id: 't' }, { isError: true }, 2)[0] as any).ok, false)
  assert.equal((toolEnd({ tool: 'Bash', tool_use_id: 't' }, { deny: 'no' }, 2)[0] as any).ok, false)
})
test('spawn without an id emits nothing', () => {
  assert.deepEqual(spawnStart({ subagentType: 'Explore' }, {}, 1), [])
})
test('usage maps API field names', () => {
  const [u] = stepUsage({ model: 'claude-opus-5-5' }, { input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 1, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }, 3) as any
  assert.deepEqual(u.tokens, { input: 5, output: 2, cacheRead: 1, cacheWrite: 0 })
})
test('list status transitions emit once', () => {
  const known: Record<string, string> = {}
  assert.equal(listStatus([{ id: 'a', status: 'completed' }], 1, known).length, 1)
  known.a = 'completed'
  assert.equal(listStatus([{ id: 'a', status: 'completed' }], 2, known).length, 0)
})
```

- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3:** Implement `src/mod/adapter.ts`. **Step 4:** Run it. Expected: PASS.

- [ ] **Step 5: Write `types/index.d.ts` and `hooks/register.tsx` (state part only; UI in Task 11)**

```tsx
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { SessionState } from '../src/core/model'
import { initialState, reduce } from '../src/core/reducer'
import { toolStart, toolEnd, spawnStart, stepUsage, listStatus } from '../src/mod/adapter'
import type { AgentEvent } from '../src/core/model'

const session = atom({ plugin: 'agentview', key: 'session' } as const, null as SessionState | null)

export const register: Register = on => {
  const known: Record<string, string> = {}
  const apply = async ($: any, evs: AgentEvent[]) => {
    if (!evs.length) return
    const at = await $.clock.now()
    await update($, session, s => evs.reduce(reduce, s ?? initialState('session', at)))
  }

  on('session.start', async ($, e, next) => {
    const at = await $.clock.now()
    await update($, session, s => s ?? initialState(String((e as any).sessionId ?? 'session').slice(0, 8), at))
    $.clock.every(1000, async () => {
      try {
        const now = await $.clock.now()
        const list = await $.agent.list()
        await apply($, [...listStatus(list, now, known), { kind: 'tick', at: now }])
        for (const a of list) known[a.id] = a.status
      } catch {}
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const at = await $.clock.now()
    try { await apply($, toolStart(e as any, at)) } catch {}
    const r = await next(e)
    try { await apply($, toolEnd(e as any, r as any, await $.clock.now())) } catch {}
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try { await apply($, spawnStart(e as any, r as any, await $.clock.now())) } catch {}
    return r
  })

  on('turn.step', async ($, e, next) => {
    const r = await next(e)
    try { await apply($, stepUsage(e as any, (r as any)?.usage ?? null, await $.clock.now())) } catch {}
    return r
  })
}
```

Replace the `any` casts with the real engine types once Task 1 confirms the field names. Use the session id field that `session.start`'s input type declares (grep `SessionStartInput`).

- [ ] **Step 6: Engine test `hooks/register.test.ts`.** Using `claude-code/testing` (`test`, `expect`, `mock`; see the types file for the exact kit API): raise a `Read` tool call through `$.tool.call`, then assert that the `agentview/session` state has `main.toolCount === 1`. Run `claude plugin validate agentview && claude plugin test agentview`. Expected: PASS.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(mod): feed plugin events into session state"`

---

### Task 11: `/agentview` dialog, selection, detail, Esc

Follow the Task 1 findings Q5–Q6.

**Files:**
- Create: `src/mod/paint.tsx`
- Modify: `hooks/register.tsx`, `hooks/register.test.ts`

**Interfaces:**
- Consumes: `renderDialog`, `windowFor`, `renderDetail`, `buildRows`, `planOf`, `SPIN`, the atoms from Task 10.
- Produces: `lineToText(line: string, h: { Text: any; Box: any }): JSX.Element` (parses `{codes|text}` into a row of `<Text>` runs: `d`→`dimColor`, `B`→`weight="bold"`, `I`→`inverse`, `c/y/g/r/b`→`color="cyan|yellow|green|red|blue"`).

- [ ] **Step 1: Write `src/mod/paint.tsx`**

```tsx
const COLOR: Record<string, string> = { c: 'cyan', y: 'yellow', g: 'green', r: 'red', b: 'blue' }
const RE = /\{([a-zA-Z]+)\|([^{}]*)\}/g

export const runs = (line: string): { codes: string; text: string }[] => {
  const out: { codes: string; text: string }[] = []; let i = 0; let m: RegExpExecArray | null
  RE.lastIndex = 0
  while ((m = RE.exec(line))) {
    if (m.index > i) out.push({ codes: '', text: line.slice(i, m.index) })
    out.push({ codes: m[1], text: m[2] }); i = RE.lastIndex
  }
  if (i < line.length) out.push({ codes: '', text: line.slice(i) })
  return out
}

export const lineToText = (line: string, { Text }: { Text: any }) => (
  <Text>
    {runs(line).map(r => {
      const color = [...r.codes].map(c => COLOR[c]).find(Boolean)
      return <Text color={color} dimColor={r.codes.includes('d') || undefined}
        weight={r.codes.includes('B') ? 'bold' : undefined} inverse={r.codes.includes('I') || undefined}>{r.text}</Text>
    })}
  </Text>
)
```

Add a pure test `tests/mod/paint.spec.ts` for `runs`: `runs('{d|│} x {IB|sel}')` gives `[{codes:'d',text:'│'},{codes:'',text:' x '},{codes:'IB',text:'sel'}]`.

- [ ] **Step 2: Add UI state, the command, the pane and the keys to `hooks/register.tsx`**
  - The `ui` atom holds `{ open, view, selId, win, spin }`.
  - `session.start`: `$.command.register({ name: 'agentview', description: 'Live view of agents and subagents' })`.
  - `command.run` `{ command: 'agentview' }`: set `ui.open = true`, `view = 'tree'`, `selId = 'main'`. Then `$.ui.open({ id: 'agentview', title: 'agentview', focus: true, closeOnEscape: true, holdToasts: true })`. Return `{ text: 'agentview opened' }`.
  - Spinner: while `ui.open`, a `$.clock.every(125)` timer advances `spin` (mod 10). Cancel it on close. The 1 s tick from Task 10 keeps running for TIME and `unknown`.
  - `ui.render` `{ component: 'Pane', requestId: 'agentview' }`:
    - `W = e.props.bodyColumns` (plus 2 if the engine draws its own frame, per Q5).
    - Build rows with `buildRows(session, now)` and `plan = planOf(session.todos.main)`.
    - `rowsRoom = max(3, (e.viewport?.rows ?? 24) - 10)`.
    - `sel = rows.findIndex(r => r.id === selId)`, or 0 when not found.
    - `win = windowFor(rows.length, sel, rowsRoom, ui.win)`.
    - Tree view: `renderDialog({ W, agents: rows, sel, sid, plan, win: rows.length > rowsRoom ? win : undefined, spin: SPIN[spin], ascii: ASCII, frame, after: rows.length === 1 ? [the 7a "no subagents yet" line] : undefined })`.
    - Detail view: `renderDetail(...)` for `selId`.
    - Map each line through `lineToText`.
    - Navigation follows Q6. Recommended: render each agent row as a `plain` `Button` (`key = row.id`, `onPress` → `view = 'detail'`). A `ui.focus` hook sets `selId` from `e.element`. If Buttons cannot carry styled children, keep the `<Text>` rows for display, and add invisible-label Buttons, or `hotkey` Buttons `j`/`k`/`l` for down/up/enter, whichever Q6 proved works. Note the choice in `AGENTVIEW.md` §5.
    - In detail view, ↑↓ step to the previous/next row id.
  - `ui.close` `{ requestId: 'agentview' }` with origin `person`: when `view === 'detail'`, set `view = 'tree'` and refuse the close (return without `next`, exactly as Q6 found). Otherwise set `ui.open = false`, cancel the spinner timer and call `next(e)`.
  - ASCII: `ASCII = options/env AGENTVIEW_ASCII === '1'`. Read it the way the reference shows for options or the environment (`$.process` env or `userConfig`). If neither is reachable in a mod, add a `userConfig` boolean `ascii` to `plugin.json` instead.

- [ ] **Step 3: Engine UI test.** Following the reference's UI-test section: mount the `Pane` for `requestId: 'agentview'` on `terminal` and `desktop`, seed the session atom with two agents, assert that the drawing contains `agentview` and `running`, press the second row and assert that the detail view shows `TASK`. Run `claude plugin test agentview`. Expected: PASS.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "feat(mod): /agentview live dialog with detail view"`

---

### Task 12: Status line and edge cases

**Files:**
- Modify: `hooks/register.tsx`, `hooks/register.test.ts`

- [ ] **Step 1: Status line.** In the 1 s tick and after every `apply`, compute `statusLine(buildRows(s, now), planOf(s.todos.main))`. Call `$.ui.status(text)` only when the text changed since the last call (keep the last text in a module variable). With only `main` and no todos, still show it (the spec shows `⠋ 1 running · 6.2k tok · —   /agentview`).
- [ ] **Step 2: Edge cases (spec 3.6 and 7a–7e), each with an engine test in `hooks/register.test.ts`:**
  - A hook that throws inside our code never breaks the tool call. Test: corrupt the atom to `null` mid-test; the tool call still returns its result.
  - A subagent with no end signal for > 60 s shows `unknown`. Test: mocked clock advanced 61 s.
  - A session end (main `turn.complete`, or the `session.end` event if it exists — grep the types) with subagents still `running`: they stay, and the tick turns them `unknown`. No fake `done`.
  - Narrow pane (`bodyColumns` 60–79) renders tier 1 without throwing. Below 60: render the name + glyph + TIME only. Implement this as `W < 60` in `renderDialog`: columns `name`, `st` (glyph only, width 1), `time`. Add a unit test in `tests/view/dialog.spec.ts` asserting each line's `vl` equals `W` for W = 50.
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && claude plugin validate . && claude plugin test .` Expected: all PASS.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "feat(mod): status line and edge cases"`

---

### Task 13: Real-session check, README, v0.1.0

**Files:**
- Create: `README.md`
- Modify: `AGENTVIEW.md` (§4 checkboxes 1.1–1.13, §6, §7)

- [ ] **Step 1: Manual run.** `claude --plugin-dir "/path/to/agentview"`. In it, ask for a task that spawns 2–3 subagents (e.g. "use two Explore subagents in parallel to list files in /usr/share/doc and /etc, then summarize"). Then:
  - open `/agentview`;
  - check live updates, the spinner, TIME, tokens growing per agent, ↑↓ selection, Enter → detail, Esc → back, Esc → close, and the status line text;
  - resize the terminal to 80 and 160 columns.

  Write down every mismatch with the spec. Fix each one with a failing test first.
- [ ] **Step 2: README.md** (English): what it is (one paragraph + the 1a mockup as a code block), install for development (`claude --plugin-dir <path>`), usage (`/agentview`, keys), what the numbers mean (TOK, `~` cost estimate, plan % only from the todo list, `unknown` after 60 s), limitations, and license MIT. No marketplace install yet (Phase 3).
- [ ] **Step 3: Update AGENTVIEW.md.** Check 1.1–1.13 with one-line notes, add findings to §6 and a log line to §7, and set Status to "Faza 1 završena; sljedeće Faza 1b (graph) ili Faza 2 (CLI)". Write these notes in Bosnian, like the rest of that file.
- [ ] **Step 4: Commit and tag**

```bash
git add -A && git commit -m "docs: README; release 0.1.0"
git tag v0.1.0
```
